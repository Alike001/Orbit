const { z } = require('zod');
const {
    Asset,
    BASE_FEE,
    Horizon,
    Keypair,
    Networks,
    Operation,
    StrKey,
    TransactionBuilder,
} = require('@stellar/stellar-sdk');

/**
 * Stellar testnet funding helpers for local development (#232).
 *
 *   fundTestnetAccount(publicKey)  creates/funds an account through Friendbot, retrying
 *                                  transient failures; an already funded account is not an error
 *   ensureUsdcTrustline(keypair)   checks the testnet USDC asset exists, then submits a
 *                                  ChangeTrust unless the account already trusts it
 *   POST /api/dev/fund             bootstraps a dev account in one call; never registered
 *                                  (and refused at request time) when NODE_ENV=production
 */

const TESTNET_FRIENDBOT_URL = 'https://friendbot.stellar.org';
const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
// Circle's USDC issuer on the Stellar testnet
const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

class DevFundingError extends Error {
    constructor(message, status = 500, code = 'dev_funding_failed') {
        super(message);
        this.name = 'DevFundingError';
        this.status = status;
        this.code = code;
    }
}

const isProduction = (env = process.env) => env.NODE_ENV === 'production';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Friendbot answers 400 with an op_already_exists / createAccountAlreadyExist result
// when the account exists; that is success for an idempotent bootstrap.
const ALREADY_FUNDED = /op_already_exists|createAccountAlreadyExist|already (been )?funded/i;

/**
 * Funds `publicKey` through Friendbot. Network errors, 429 and 5xx responses are
 * retried with exponential backoff; other 4xx responses fail immediately.
 * Returns { funded, alreadyFunded, hash, attempts }.
 */
const fundTestnetAccount = async (publicKey, {
    friendbotUrl = TESTNET_FRIENDBOT_URL,
    fetchImpl = globalThis.fetch,
    maxAttempts = 4,
    baseDelayMs = 500,
    sleep = defaultSleep,
} = {}) => {
    if (!StrKey.isValidEd25519PublicKey(publicKey || '')) {
        throw new DevFundingError('public_key must be a valid Stellar account ID (G...)', 400, 'invalid_public_key');
    }

    const url = `${friendbotUrl.replace(/\/+$/, '')}?addr=${encodeURIComponent(publicKey)}`;
    let lastError = 'no response';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let retryable = true;
        try {
            const res = await fetchImpl(url);
            const text = await res.text().catch(() => '');
            if (res.ok) {
                let body = {};
                try { body = JSON.parse(text); } catch { /* Friendbot normally returns JSON */ }
                return { funded: true, alreadyFunded: false, hash: body.hash || body.id || null, attempts: attempt };
            }
            if (ALREADY_FUNDED.test(text)) {
                return { funded: false, alreadyFunded: true, hash: null, attempts: attempt };
            }
            lastError = `Friendbot responded ${res.status}: ${text.slice(0, 200)}`;
            retryable = res.status === 429 || res.status >= 500;
        } catch (err) {
            lastError = err?.message || String(err);
        }
        if (!retryable) throw new DevFundingError(lastError, 502, 'friendbot_rejected');
        if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
    throw new DevFundingError(`Friendbot funding failed after ${maxAttempts} attempts: ${lastError}`, 502, 'friendbot_unavailable');
};

/**
 * Makes `keypair`'s account trust the testnet USDC asset. Verifies the asset exists
 * on Horizon first, and does nothing when the trustline is already present.
 * Returns { created, alreadyExists, hash, asset }.
 */
const ensureUsdcTrustline = async (keypair, {
    server = new Horizon.Server(TESTNET_HORIZON_URL),
    assetCode = 'USDC',
    issuer = TESTNET_USDC_ISSUER,
    networkPassphrase = Networks.TESTNET,
} = {}) => {
    const asset = new Asset(assetCode, issuer);
    const assetId = `${assetCode}:${issuer}`;

    const { records = [] } = await server.assets().forCode(assetCode).forIssuer(issuer).call();
    if (!records.length) {
        throw new DevFundingError(`Asset ${assetId} does not exist on this network`, 404, 'asset_not_found');
    }

    let account;
    try {
        account = await server.loadAccount(keypair.publicKey());
    } catch (err) {
        if (err?.response?.status === 404 || err?.name === 'NotFoundError') {
            throw new DevFundingError('Account does not exist yet; fund it before adding a trustline', 409, 'account_not_funded');
        }
        throw err;
    }

    const existing = (account.balances || []).some((balance) =>
        balance.asset_code === assetCode && balance.asset_issuer === issuer);
    if (existing) return { created: false, alreadyExists: true, hash: null, asset: assetId };

    const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
        .addOperation(Operation.changeTrust({ asset }))
        .setTimeout(60)
        .build();
    transaction.sign(keypair);
    const result = await server.submitTransaction(transaction);
    return { created: true, alreadyExists: false, hash: result?.hash || null, asset: assetId };
};

const fundRequestSchema = z.object({
    public_key: z.string().optional(),
    secret_key: z.string().optional(),
    trustline: z.boolean().default(true),
});

/**
 * Registers POST /api/dev/fund unless NODE_ENV is production. Body (all optional):
 *   { public_key, secret_key, trustline = true }
 * - secret_key: fund that account and add the USDC trustline (it signs the ChangeTrust)
 * - public_key only: fund it; the trustline is skipped because it cannot be signed
 * - neither: generate a fresh testnet keypair, fund it and add the trustline
 * Returns true when the route was registered.
 */
const registerDevFundingRoutes = (app, {
    env = process.env,
    getFetch = () => globalThis.fetch,
    getHorizonServer = () => null,
} = {}) => {
    if (isProduction(env)) return false;

    let defaultServer;
    const horizonServer = () => getHorizonServer()
        || (defaultServer ??= new Horizon.Server(env.DEV_FUND_HORIZON_URL || env.HORIZON_URL || TESTNET_HORIZON_URL));

    app.post('/api/dev/fund', async (req, res) => {
        // Checked again per request, so flipping NODE_ENV can never expose the faucet
        if (isProduction(process.env) || isProduction(env)) return res.status(404).json({ error: 'Not found' });
        if (env.STELLAR_NETWORK_PASSPHRASE && env.STELLAR_NETWORK_PASSPHRASE !== Networks.TESTNET) {
            return res.status(403).json({ error: 'Dev funding is only available on the Stellar testnet', code: 'not_testnet' });
        }

        const parsed = fundRequestSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(', ') });
        const { public_key: publicKey, secret_key: secretKey, trustline } = parsed.data;

        try {
            let keypair = null;
            let generated = false;
            if (secretKey) {
                try {
                    keypair = Keypair.fromSecret(secretKey);
                } catch {
                    return res.status(400).json({ error: 'secret_key must be a valid Stellar secret seed (S...)', code: 'invalid_secret_key' });
                }
                if (publicKey && publicKey !== keypair.publicKey()) {
                    return res.status(400).json({ error: 'public_key does not match secret_key', code: 'key_mismatch' });
                }
            } else if (!publicKey) {
                keypair = Keypair.random();
                generated = true;
            }
            const accountId = keypair ? keypair.publicKey() : publicKey;

            const funding = await fundTestnetAccount(accountId, {
                friendbotUrl: env.DEV_FRIENDBOT_URL || TESTNET_FRIENDBOT_URL,
                fetchImpl: getFetch() || globalThis.fetch,
            });

            let trustlineResult = { skipped: true, reason: 'trustline not requested' };
            if (trustline && keypair) {
                trustlineResult = await ensureUsdcTrustline(keypair, {
                    server: horizonServer(),
                    issuer: env.DEV_USDC_ISSUER || TESTNET_USDC_ISSUER,
                });
            } else if (trustline) {
                trustlineResult = { skipped: true, reason: 'secret_key is required to sign the USDC trustline' };
            }

            res.status(200).json({
                public_key: accountId,
                // Only ever returned for a keypair generated by this call, on testnet, outside production
                ...(generated ? { secret_key: keypair.secret() } : {}),
                funding,
                trustline: trustlineResult,
            });
        } catch (err) {
            if (err instanceof DevFundingError) return res.status(err.status).json({ error: err.message, code: err.code });
            console.error('Dev funding failed:', err);
            res.status(502).json({ error: err.message || 'Dev funding failed', code: 'dev_funding_failed' });
        }
    });
    return true;
};

module.exports = {
    TESTNET_FRIENDBOT_URL,
    TESTNET_HORIZON_URL,
    TESTNET_USDC_ISSUER,
    DevFundingError,
    fundTestnetAccount,
    ensureUsdcTrustline,
    registerDevFundingRoutes,
};
