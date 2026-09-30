const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');
const { StrKey, Keypair, rpc, Networks, TransactionBuilder, Contract, xdr } = require('@stellar/stellar-sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using service role for backend logic
let defaultSupabase = null;
if (supabaseUrl && supabaseKey) {
    defaultSupabase = createClient(supabaseUrl, supabaseKey);
}

const getSupabase = () => app.locals.supabase || defaultSupabase;

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const stellarAddressSchema = z.string().refine(
    (val) => StrKey.isValidEd25519PublicKey(val),
    { message: "must be a valid Stellar Ed25519 public address" }
);

const createPlanSchema = z.object({
    merchant_id: z.string().uuid("merchant_id must be a valid UUID"),
    name: z.string().trim().min(1, "name cannot be empty"),
    usdc_amount: z.coerce.number().positive("usdc_amount must be greater than 0"),
    interval_seconds: z.coerce.number().int().positive("interval_seconds must be a positive integer"),
});

const getPlanParamsSchema = z.object({
    id: z.string().uuid("id parameter must be a valid UUID"),
});

const getSubscribersQuerySchema = z.object({
    merchant_id: z.string().uuid("merchant_id must be a valid UUID"),
});

const createSubscriptionSchema = z.object({
    plan_id: z.string().uuid("plan_id must be a valid UUID"),
    customer_wallet_address: stellarAddressSchema,
});

const triggerPullSchema = z.object({
    subscription_id: z.string().uuid("subscription_id must be a valid UUID"),
    merchant_secret: z.string().min(1, "merchant_secret is required"),
});

const formatZodError = (err) => {
    const issue = err.issues[0];
    const field = issue.path.join('.') || 'input';
    return `Invalid input on ${field}: ${issue.message}`;
};

// ==========================================
// ROUTE 1: POST /plans (Create a new pricing plan)
// ==========================================
app.post('/plans', async (req, res) => {
    const parseResult = createPlanSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: formatZodError(parseResult.error) });
    }

    try {
        const { merchant_id, name, usdc_amount, interval_seconds } = parseResult.data;
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

        const { data, error } = await supabase
            .from('plans')
            .insert([{ merchant_id, name, usdc_amount, interval_seconds }])
            .select()
            .single();

        if (error) throw error;
        
        res.status(201).json({ message: "Plan created successfully", plan: data });
    } catch (err) {
        console.error("Error creating plan:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROUTE 2: GET /plans/:id (Fetch plan details for Checkout Widget)
// ==========================================
app.get('/plans/:id', async (req, res) => {
    const parseResult = getPlanParamsSchema.safeParse(req.params);
    if (!parseResult.success) {
        return res.status(400).json({ error: formatZodError(parseResult.error) });
    }

    try {
        const { id } = parseResult.data;
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

        const { data, error } = await supabase
            .from('plans')
            .select('*, merchants(name, wallet_address)') // Also fetch the merchant's details
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: "Plan not found" });

        res.status(200).json({ plan: data });
    } catch (err) {
        console.error("Error fetching plan:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROUTE 3: GET /subscribers (Fetch active subscribers for dashboard)
// ==========================================
app.get('/subscribers', async (req, res) => {
    const parseResult = getSubscribersQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
        return res.status(400).json({ error: formatZodError(parseResult.error) });
    }

    try {
        const { merchant_id } = parseResult.data;
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

        // Find all subscriptions tied to plans owned by this merchant
        const { data, error } = await supabase
            .from('subscriptions')
            .select(`
                *,
                plans!inner(merchant_id, name, usdc_amount)
            `)
            .eq('plans.merchant_id', merchant_id);

        if (error) throw error;

        res.status(200).json({ subscribers: data });
    } catch (err) {
        console.error("Error fetching subscribers:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROUTE 4: POST /trigger-pull (The Blockchain Bridge)
// ==========================================
app.post('/trigger-pull', async (req, res) => {
    const parseResult = triggerPullSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: formatZodError(parseResult.error) });
    }

    try {
        const { subscription_id, merchant_secret } = parseResult.data;
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

        // 1. Fetch Subscription and Plan data from Supabase
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select(`
                *,
                plans ( merchant_id, usdc_amount, interval_seconds )
            `)
            .eq('id', subscription_id)
            .single();

        if (subError) throw subError;
        if (!sub) return res.status(404).json({ error: "Subscription not found" });

        // We also need the merchant's public address to match against the secret
        const { data: merchant, error: merchantError } = await supabase
            .from('merchants')
            .select('wallet_address')
            .eq('id', sub.plans.merchant_id)
            .single();

        if (merchantError) throw merchantError;

        // 2. Setup Stellar SDK (Testnet)
        let merchantKeypair;
        try {
            merchantKeypair = Keypair.fromSecret(merchant_secret);
        } catch {
            return res.status(400).json({ error: "Invalid merchant_secret: not a valid Stellar secret key" });
        }
        
        // Verify the provided secret matches the merchant in the database
        if (merchantKeypair.publicKey() !== merchant.wallet_address) {
            return res.status(401).json({ error: "Merchant secret does not match the plan owner's address" });
        }

        const ORBIT_CONTRACT_ID = process.env.ORBIT_CONTRACT_ID; 
        if (!ORBIT_CONTRACT_ID) {
            return res.status(500).json({ error: "ORBIT_CONTRACT_ID not set in .env" });
        }

        const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
        const server = new rpc.Server(rpcUrl);
        const contract = new Contract(ORBIT_CONTRACT_ID);
        
        // 3. Build the Soroban Transaction
        const account = await server.getAccount(merchantKeypair.publicKey());
        
        const tx = new TransactionBuilder(account, {
            fee: "1000000",
            networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET
        })
        .addOperation(contract.call("pull_funds", 
            xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeAccount(Keypair.fromPublicKey(sub.customer_wallet_address).xdrPublicKey())), // User
            xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeAccount(merchantKeypair.xdrPublicKey())) // Merchant
        ))
        .setTimeout(30)
        .build();

        // 4. Simulate & Sign & Submit
        const preparedTx = await server.prepareTransaction(tx);
        preparedTx.sign(merchantKeypair);

        console.log("Submitting 'pull_funds' to Soroban testnet...");
        let txResponse = await server.sendTransaction(preparedTx);
        
        if (txResponse.status !== "PENDING" && txResponse.status !== "SUCCESS") {
             throw new Error(`Transaction failed: ${JSON.stringify(txResponse)}`);
        }

        // 5. Update next_billing_date in database
        const pullTime = new Date();
        const nextBilling = new Date(pullTime.getTime() + Number(sub.plans.interval_seconds) * 1000);

        await supabase
            .from('subscriptions')
            .update({ next_billing_date: nextBilling.toISOString() })
            .eq('id', subscription_id);

        res.status(200).json({ 
            message: "Successfully pulled funds on-chain!", 
            txHash: txResponse.hash 
        });

    } catch (err) {
        console.error("Error triggering pull:", err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ROUTE 5: POST /subscriptions (Create Subscription after Handshake)
// ==========================================
app.post('/subscriptions', async (req, res) => {
    const parseResult = createSubscriptionSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: formatZodError(parseResult.error) });
    }

    try {
        const { plan_id, customer_wallet_address } = parseResult.data;
        const supabase = getSupabase();
        if (!supabase) return res.status(500).json({ error: "Supabase client not initialized" });

        const nextBillingDate = new Date().toISOString();

        const { data, error } = await supabase
            .from('subscriptions')
            .insert([{ plan_id, customer_wallet_address, next_billing_date: nextBillingDate }])
            .select()
            .single();

        if (error) throw error;
        
        res.status(201).json({ message: "Subscription created", subscription: data });
    } catch (err) {
        console.error("Error creating subscription:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Orbit Merchant API running on http://localhost:${PORT}`);
    });
}

module.exports = app;
