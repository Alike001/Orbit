const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using service role for backend logic
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ROUTE 1: POST /plans (Create a new pricing plan)
// ==========================================
app.post('/plans', async (req, res) => {
    try {
        const { merchant_id, name, usdc_amount, interval_seconds } = req.body;
        
        // Basic validation
        if (!merchant_id || !name || !usdc_amount || !interval_seconds) {
            return res.status(400).json({ error: "Missing required fields" });
        }

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
    try {
        const { id } = req.params;

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
    try {
        // In a real app, you'd extract the merchant_id from the authenticated user's session token.
        // For MVP testing, we can pass merchant_id in the query params.
        const { merchant_id } = req.query;
        
        if (!merchant_id) {
            return res.status(400).json({ error: "Missing merchant_id query parameter" });
        }

        // We need to find all subscriptions tied to plans owned by this merchant
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
const { Keypair, rpc, Networks, TransactionBuilder, Contract, xdr, Asset } = require('@stellar/stellar-sdk');

app.post('/trigger-pull', async (req, res) => {
    try {
        const { subscription_id, merchant_secret } = req.body;

        if (!subscription_id || !merchant_secret) {
            return res.status(400).json({ error: "Missing subscription_id or merchant_secret" });
        }

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
        const server = new rpc.Server('https://soroban-testnet.stellar.org');
        const merchantKeypair = Keypair.fromSecret(merchant_secret);
        
        // Verify the provided secret matches the merchant in the database
        if (merchantKeypair.publicKey() !== merchant.wallet_address) {
            return res.status(401).json({ error: "Merchant secret does not match the plan owner's address" });
        }

        // NOTE: In a real app, you would read the ORBIT_CONTRACT_ID from .env
        const ORBIT_CONTRACT_ID = process.env.ORBIT_CONTRACT_ID; 
        if (!ORBIT_CONTRACT_ID) {
            return res.status(500).json({ error: "ORBIT_CONTRACT_ID not set in .env" });
        }

        const contract = new Contract(ORBIT_CONTRACT_ID);
        
        // 3. Build the Soroban Transaction
        const account = await server.getAccount(merchantKeypair.publicKey());
        
        const tx = new TransactionBuilder(account, {
            fee: "1000000",
            networkPassphrase: Networks.TESTNET
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

        // Wait for the transaction to complete
        // In a production app, you'd want to poll `server.getTransaction(txResponse.hash)` 
        // to confirm success before updating the database.

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
    try {
        const { plan_id, customer_wallet_address } = req.body;
        
        if (!plan_id || !customer_wallet_address) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Calculate next billing date (immediately or 1 month from now depending on logic)
        // Since the customer just approved the allowance, the merchant will pull funds right after.
        // We set next_billing_date to now so the cron job can pick it up immediately.
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
app.listen(PORT, () => {
    console.log(`Orbit Merchant API running on http://localhost:${PORT}`);
});
