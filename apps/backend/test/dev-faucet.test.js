import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';
import app from '../index.js';
import {
  TESTNET_USDC_ISSUER,
  fundTestnetAccount,
  ensureUsdcTrustline,
  registerDevFundingRoutes,
} from '../dev-faucet.js';

// Same SDK copy as dev-faucet.js (CommonJS build), so XDR classes match
const { Keypair, Networks, TransactionBuilder } = createRequire(import.meta.url)('@stellar/stellar-sdk');

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

// Minimal Horizon.Server stand-in
const mockHorizon = ({ assetExists = true, balances = [], accountExists = true } = {}) => {
  const server = {
    assets: vi.fn(() => ({ forCode: () => ({ forIssuer: () => ({ call: async () => ({ records: assetExists ? [{ asset_code: 'USDC' }] : [] }) }) }) })),
    loadAccount: vi.fn(async (accountId) => {
      if (!accountExists) throw Object.assign(new Error('Not Found'), { name: 'NotFoundError' });
      const { Account } = createRequire(import.meta.url)('@stellar/stellar-sdk');
      return Object.assign(new Account(accountId, '100'), { balances });
    }),
    submitTransaction: vi.fn(async () => ({ hash: 'trustline-hash' })),
  };
  return server;
};

describe('fundTestnetAccount (#232)', () => {
  const account = Keypair.random().publicKey();

  it('funds a new account through Friendbot', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { hash: 'fund-hash' }));
    const result = await fundTestnetAccount(account, { fetchImpl, friendbotUrl: 'https://friendbot.test/' });
    expect(result).toEqual({ funded: true, alreadyFunded: false, hash: 'fund-hash', attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(`https://friendbot.test?addr=${account}`);
  });

  it('retries transient Friendbot failures with backoff', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(reply(503, 'unavailable'))
      .mockResolvedValueOnce(reply(200, { hash: 'fund-hash' }));
    const result = await fundTestnetAccount(account, { fetchImpl, sleep, baseDelayMs: 100 });
    expect(result).toMatchObject({ funded: true, attempts: 3 });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200]);
  });

  it('treats an already funded account as success', async () => {
    const fetchImpl = vi.fn(async () => reply(400, { detail: 'createAccountAlreadyExist', extras: { result_codes: { operations: ['op_already_exists'] } } }));
    expect(await fundTestnetAccount(account, { fetchImpl })).toMatchObject({ funded: false, alreadyFunded: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after the maximum attempts and rejects invalid keys without calling Friendbot', async () => {
    const fetchImpl = vi.fn(async () => reply(500, 'boom'));
    await expect(fundTestnetAccount(account, { fetchImpl, maxAttempts: 3, sleep: async () => {} }))
      .rejects.toMatchObject({ status: 502, code: 'friendbot_unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    const neverCalled = vi.fn();
    await expect(fundTestnetAccount('not-a-key', { fetchImpl: neverCalled })).rejects.toMatchObject({ status: 400 });
    expect(neverCalled).not.toHaveBeenCalled();
  });
});

describe('ensureUsdcTrustline (#232)', () => {
  it('submits a signed ChangeTrust for the testnet USDC asset', async () => {
    const keypair = Keypair.random();
    const server = mockHorizon();

    const result = await ensureUsdcTrustline(keypair, { server });

    expect(result).toEqual({ created: true, alreadyExists: false, hash: 'trustline-hash', asset: `USDC:${TESTNET_USDC_ISSUER}` });
    const [tx] = server.submitTransaction.mock.calls[0];
    const decoded = TransactionBuilder.fromXDR(tx.toXDR(), Networks.TESTNET);
    expect(decoded.source).toBe(keypair.publicKey());
    expect(decoded.operations).toHaveLength(1);
    expect(decoded.operations[0]).toMatchObject({ type: 'changeTrust', line: { code: 'USDC', issuer: TESTNET_USDC_ISSUER } });
    expect(keypair.verify(decoded.hash(), decoded.signatures[0].signature.value)).toBe(true);
  });

  it('is idempotent when the trustline already exists', async () => {
    const server = mockHorizon({ balances: [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: TESTNET_USDC_ISSUER, balance: '0' }] });
    expect(await ensureUsdcTrustline(Keypair.random(), { server })).toMatchObject({ created: false, alreadyExists: true });
    expect(server.submitTransaction).not.toHaveBeenCalled();
  });

  it('verifies the asset exists and the account is funded before submitting', async () => {
    const missingAsset = mockHorizon({ assetExists: false });
    await expect(ensureUsdcTrustline(Keypair.random(), { server: missingAsset })).rejects.toMatchObject({ status: 404, code: 'asset_not_found' });
    expect(missingAsset.loadAccount).not.toHaveBeenCalled();

    const unfunded = mockHorizon({ accountExists: false });
    await expect(ensureUsdcTrustline(Keypair.random(), { server: unfunded })).rejects.toMatchObject({ status: 409, code: 'account_not_funded' });
    expect(unfunded.submitTransaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/dev/fund (#232)', () => {
  afterEach(() => {
    delete app.locals.fetchImpl;
    delete app.locals.devHorizonServer;
    app.locals.rateLimiters.ip.reset();
  });

  it('is not registered when NODE_ENV is production', async () => {
    const prodApp = express();
    prodApp.use(express.json());
    expect(registerDevFundingRoutes(prodApp, { env: { NODE_ENV: 'production' } })).toBe(false);
    expect((await request(prodApp).post('/api/dev/fund').send({})).status).toBe(404);
  });

  it('refuses requests if NODE_ENV becomes production after startup', async () => {
    const devApp = express();
    devApp.use(express.json());
    const fetchImpl = vi.fn();
    registerDevFundingRoutes(devApp, { env: { NODE_ENV: 'development' }, getFetch: () => fetchImpl });
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect((await request(devApp).post('/api/dev/fund').send({})).status).toBe(404);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('refuses to run against a non-testnet network', async () => {
    const devApp = express();
    devApp.use(express.json());
    registerDevFundingRoutes(devApp, { env: { NODE_ENV: 'development', STELLAR_NETWORK_PASSPHRASE: Networks.PUBLIC } });
    expect((await request(devApp).post('/api/dev/fund').send({})).status).toBe(403);
  });

  it('funds an account and adds the USDC trustline from its secret key', async () => {
    const keypair = Keypair.random();
    app.locals.fetchImpl = vi.fn(async () => reply(200, { hash: 'fund-hash' }));
    app.locals.devHorizonServer = mockHorizon();

    const res = await request(app).post('/api/dev/fund').send({ secret_key: keypair.secret() });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      public_key: keypair.publicKey(),
      funding: { funded: true, alreadyFunded: false, hash: 'fund-hash', attempts: 1 },
      trustline: { created: true, alreadyExists: false, hash: 'trustline-hash', asset: `USDC:${TESTNET_USDC_ISSUER}` },
    });
    expect(res.body.secret_key).toBeUndefined();
  });

  it('generates, funds and returns a fresh keypair when no key is given', async () => {
    app.locals.fetchImpl = vi.fn(async () => reply(200, { hash: 'fund-hash' }));
    app.locals.devHorizonServer = mockHorizon();

    const res = await request(app).post('/api/dev/fund').send({});

    expect(res.status).toBe(200);
    expect(Keypair.fromSecret(res.body.secret_key).publicKey()).toBe(res.body.public_key);
    expect(res.body.trustline.created).toBe(true);
  });

  it('funds a public key but skips the trustline it cannot sign, and validates input', async () => {
    const publicKey = Keypair.random().publicKey();
    app.locals.fetchImpl = vi.fn(async () => reply(200, { hash: 'fund-hash' }));
    app.locals.devHorizonServer = mockHorizon();

    const res = await request(app).post('/api/dev/fund').send({ public_key: publicKey });
    expect(res.status).toBe(200);
    expect(res.body.trustline).toEqual({ skipped: true, reason: 'secret_key is required to sign the USDC trustline' });
    expect(app.locals.devHorizonServer.submitTransaction).not.toHaveBeenCalled();

    expect((await request(app).post('/api/dev/fund').send({ secret_key: 'SBAD' })).status).toBe(400);
    expect((await request(app).post('/api/dev/fund').send({ public_key: 'GBAD' })).status).toBe(400);
    const mismatch = await request(app).post('/api/dev/fund').send({ public_key: publicKey, secret_key: Keypair.random().secret() });
    expect(mismatch.body.code).toBe('key_mismatch');
  });
});
