# Orbit: Stage 3 Architecture Spec

**Orbit is the financial operating system for the global internet.**
This document outlines the technical stack, data flow, and smart contract architecture required to build the Orbit MVP.

---

## 1. The Tech Stack

We are choosing a battle-tested, high-performance stack that allows us to move fast while looking like a multi-million dollar company.

* **Frontend (Dashboard & Checkout Widget):** Next.js (React), Tailwind CSS. For the checkout widget animations, we will use Framer Motion and GSAP to give it that buttery-smooth, premium Stripe-like feel.
* **Backend / API:** Node.js & Express.js. This will handle the dashboard logic, API usage aggregation, and bridging the frontend to the blockchain.
* **Database:** Supabase (PostgreSQL). We will use this to store merchant accounts, their custom pricing plans, and off-chain records of who is subscribed.
* **Smart Contracts (The Core):** Rust on Soroban (Stellar’s smart contract platform). 
* **Blockchain Bridge:** We will use the official `@stellar/stellar-sdk` and `@stellar/freighter-api` to allow our Next.js frontend and Express backend to talk directly to the Soroban smart contracts.

---

## 2. Dedicated User Flows (Dashboard vs. SDK)

To truly understand the architecture, we must split the app into its two distinct user experiences: the **Merchant** (using the dashboard) and the **Customer** (using the SDK).

### A. The Merchant Flow (Dashboard User)
This flow represents the business owner (e.g., a SaaS founder) logging into the Orbit web app (`dashboard.orbit.network`) to manage their revenue, create pricing plans, and run payroll.

```text
+-----------------+      +-----------------+      +-----------------+
|   Merchant      |      | Orbit Dashboard |      | Supabase &      |
|   (Founder)     |      |   (Next.js)     |      | Express Backend |
+--------+--------+      +--------+--------+      +--------+--------+
         |                        |                        |
         | 1. Connects Wallet     |                        |
         |----------------------->| 2. Auth & Fetch Data   |
         |                        |----------------------->|
         | 3. Creates "Pro Plan"  |                        |
         |----------------------->| 4. Saves to Database   |
         |                        |----------------------->|
         | 5. Uploads CSV         |                        |
         |    (Batch Payroll)     |                        |
         |----------------------->| 6. Parse CSV into JSON |
         |                        |----------------------->|
         | 7. Signs Payload       |                        |
         |<-----------------------|                        |
         | 8. Executes via Wallet |                        |
         +-----------------+      +-----------------+      +-----------------+
```
**Step-by-Step (Dashboard):**
1. **Authentication:** The merchant visits the Orbit dashboard and connects their Freighter wallet to log in securely.
2. **Setup:** They create a new subscription plan (e.g., "$29/mo Pro Plan"). The Next.js frontend sends this to the Express backend, which stores it in Supabase and generates a unique `plan_id`.
3. **Monitoring:** They view a live list of active subscribers pulled from the backend.
4. **Execution:** For batch payroll, they upload a CSV of contractor addresses. The dashboard parses the CSV, bundles it into a JSON array, and prompts their wallet for a single signature to execute the payout via the smart contract.

### B. The Customer Flow (SDK User)
This flow represents the end-user (e.g., a designer) visiting the merchant's website and interacting with the embedded Orbit SDK widget. They never see the dashboard.

```text
+-----------------+      +-----------------+      +-----------------+
|   End User      |      |   Orbit SDK     |      | Orbit Smart     |
|  (Customer)     |      | (React Widget)  |      | Vault (Soroban) |
+--------+--------+      +--------+--------+      +--------+--------+
         |                        |                        |
         | 1. Clicks "Subscribe"  |                        |
         |    on Merchant site    |                        |
         |----------------------->|                        |
         |                        | 2. Fetch Plan Info     |
         |                        |    (e.g., 29 USDC)     |
         | 3. Orbit Modal Pops Up |<-----------------------|
         |<-----------------------|                        |
         | 4. Connects Wallet &   |                        |
         |    Approves Allowance  |                        |
         |----------------------->| 5. Submits Allowance   |
         |                        |    Transaction         |
         |                        |----------------------->| 6. Locks Vault
         | 7. Success Animation   |<-----------------------|
         |<-----------------------|                        |
         +-----------------+      +-----------------+      +-----------------+
```
**Step-by-Step (SDK):**
1. **Trigger:** The customer clicks "Subscribe" directly on the merchant's website.
2. **Initialization:** The embedded Orbit SDK reads the `plan_id` passed by the merchant, reaches out to the Orbit backend to verify the price, and renders a beautiful checkout modal overlay.
3. **Wallet Connection:** The customer connects their wallet (e.g., Freighter) inside the modal.
4. **The Handshake:** The SDK prompts the wallet to sign the specific Allowance transaction (e.g., "Pull up to 29 USDC / 30 days"). 
5. **The Vault:** The transaction is submitted to the Soroban smart contract, locking in the permission. The SDK triggers a buttery-smooth GSAP "Success" animation and passes control back to the merchant's app to grant the user access.

---

## 3. The 30-Day Automated Billing Flow (The Pull)

Once the SDK has established the allowance (Phase B above), the actual automated billing happens invisibly in the background.

```text
+-------------------+       +-------------------+       +-------------------+
|  Orbit Backend    |       | Orbit Smart Vault |       | Merchant Database |
| (Node.js/Express) |       |  (Soroban/Rust)   |       |   (Supabase)      |
+--------+----------+       +--------+----------+       +--------+----------+
         |                           |                           |
         | 1. Check chron job:       |                           |
         |    "Is Bill Due?"         |                           |
         |-------------------------->|                           |
         |                           | 2. Contract verifies:     |
         |                           |    "Time elapsed? Yes."   |
         | 3. Contract pulls funds   |<--------------------------|
         |    and sends to Merchant  |                           |
         |-------------------------->|                           |
         |                           | 4. Update status to       |
         |                           |    "Active/Paid"          |
         |                           |-------------------------->|
         +-------------------+       +-------------------+       +-------------------+
```

---

### Contract Validation & Error Guardrails

The underlying Soroban smart contract (`contracts/soroban/src/lib.rs`) strictly guards against invalid configurations and untimely pulls:
* **`create_vault` checks:**
  * Rejects non-positive amounts with panic: `"amount_per_interval must be positive"`.
  * Rejects zero duration intervals with panic: `"interval_seconds must be greater than zero"`.
* **`pull_funds` checks:**
  * Rejects uninitialized vaults with panic: `"Vault does not exist"`.
  * Rejects pull attempts before interval completion with panic: `"Too early to pull funds"`.

---

### State Archival & Storage TTL Policy

Soroban contracts use rent-based state archival where unmaintained persistent entries can expire and be moved to cold archival. In subscription architectures with long billing cycles (such as quarterly or yearly plans), vaults could expire between payment pulls, causing legitimate pulls to fail with `"Vault does not exist"`.

To guarantee continuous availability without manual restoration hurdles:
1. **Automatic Extension on Lifecycle Events:**
   * Both `create_vault` and `pull_funds` invoke `env.storage().persistent().extend_ttl(&key, threshold, extend_to)`.
   * The contract instance TTL is also extended concurrently via `env.storage().instance().extend_ttl(threshold, extend_to)`.
2. **Parameters & Buffer Constants (`contracts/soroban/src/lib.rs`):**
   * `SECONDS_PER_LEDGER = 5`: Assumed Stellar ledger generation time.
   * `TTL_MARGIN_LEDGERS = 120_960`: 7-day safety margin added on top of the calculated interval ledgers.
   * `MIN_TTL_LEDGERS = 518_400`: 30-day baseline floor ensuring even short-interval vaults maintain high persistence.
   * `TTL_THRESHOLD_LEDGERS = 120_960`: 7-day threshold below which storage TTL will be extended.
   * Dynamic calculation: `extend_to = max(interval_seconds / 5 + margin, MIN_TTL_LEDGERS)`, ensuring the vault remains live across the entire subscription period plus buffer.

---

## 4. Technical Architecture Verification

When building Web3 infrastructure, the core blockchain primitives must be verified through automated tests:

1. **The Soroban Allowance Logic:** Verified. Soroban allows the contract to execute `transfer_from` directly from the subscriber's account to the merchant's address within the approved allowance parameters, without requiring a fresh interactive signature for every billing cycle. **(Status: Implemented & Verified with 11 automated unit tests in `contracts/soroban/src/test.rs`).**
2. **Freighter Wallet UI in the SDK:** Connecting a wallet and triggering allowance approvals has been integrated via `@stellar/freighter-api`.
3. **Decimal Math in Rust:** USDC utilizes 7 decimal places (`i128` with precision multiplier `10_000_000`), avoiding floating-point imprecision.

---

## 5. The Merchant Control Center Architecture (Dashboard Spec)

Orbit's Merchant Control Center adapts the battle-tested ergonomics of top billing platforms (like Bachs and Stripe) while shedding the Web2 fiat bloat (bank holding accounts, slow KYC queues, card dispute/chargeback fees) in favor of non-custodial digital dollar rails (USDC).

```text
ORBIT MERCHANT CONTROL CENTER
├── 1. Overview (Home)
│    ├── Treasury Wallet Status: Connected [0x... / G...]
│    ├── Core Metrics: Total MRR (USDC), Active Subscribers, Settled Volume, Protocol Finality
│    └── Settled Revenue Chart: Minimal interactive line graph with hover timestamps & amounts
│
├── 2. Subscription Plans ("Products")
│    ├── Table of active plans (e.g., MailKit Pro — 29 USDC / 30 days)
│    └── "+ Create Plan" wizard (Generates unique plan_id & drop-in Checkout Widget snippet)
│
├── 3. Subscribers ("Customers")
│    ├── Customer wallet address, Plan tier, Status (Active / Expired), Next Billing Date
│    └── "Execute Pull" trigger button (executes on-chain contract pull when payment is due)
│
├── 4. Batch Payroll Engine (Orbit's Superpower)
│    ├── Drag & drop CSV parser for global contractor wallets + USDC amounts
│    ├── Client-side validation & total payout sum calculation
│    └── 1-Click "Run Payroll" button executed via a single wallet signature
│
├── 5. Payment Links (Hosted Checkout)
│    ├── Shareable checkout URLs for B2B retainers ($2,000/mo) & creator communities
│    └── 100% no-code onboarding (no SDK installation required)
│
└── 6. Developer Portal (API & Webhooks)
     ├── API Keys: Secret keys (`orb_live_...`, `orb_test_...`) for programmatic usage billing
     ├── Webhooks: Endpoint registration to broadcast on-chain settlement events to merchant servers
     └── SDK Quickstart & code samples
```

---

## 6. Developer API & Programmatic Usage Billing

To support API builders and AI startups (Use Case 2), Orbit bridges no-code dashboard founders and technical developers who require programmatic billing:

### A. Authentication
Developers generate an `ORBIT_SECRET_KEY` directly inside the Developer Portal. Every API request is authenticated via Bearer token:
```bash
Authorization: Bearer orb_sec_live_9482...
```

### B. Triggering a Usage-Based Pull
When a customer uses an API or AI compute, the merchant server can trigger an allowance pull programmatically without UI interaction:
```bash
POST https://api.orbit.network/v1/pulls
Content-Type: application/json
Authorization: Bearer orb_sec_live_9482...

{
  "subscription_id": "sub_8921",
  "amount": 3.45,
  "currency": "USDC",
  "idempotency_key": "idem_req_001"
}
```

### C. Webhook Event Distribution
Orbit delivers cryptographically signed webhooks to merchant servers for automated customer access provisioning:
* `subscription.created`: Customer approved initial allowance vault.
* `payment.settled`: Recurring monthly pull or usage charge succeeded on-chain.
* `subscription.cancelled`: Customer revoked allowance.
* `payroll.disbursed`: Batch contractor payout completed in single ledger block.

---

## 7. Settlement Vault Architecture

Orbit settles on high-speed Soroban (Stellar). To eliminate the friction of constantly switching or disconnecting wallets, Orbit uses a **Linked Settlement Vault** model:

```text
MERCHANT SETTLEMENT PROFILE
└── Stellar Soroban Vault  ──>  Freighter / Albedo (GB3X...94QA)  [Active & Verified]
```

### Key Principles:
1. **Offline Settlement:** Automated recurring pulls do not require the merchant's wallet to be connected. Funds route on-chain directly to the merchant's registered treasury address.
2. **Persistent Vault State:** The merchant links their Stellar address once and it remains active across all subscriptions; customers subscribing via Stellar pay into that vault.
3. **Contextual Actions:** When performing on-chain administrative tasks (such as signing a Batch Payroll disbursement or altering a plan), the dashboard prompts the merchant's connected wallet provider.


