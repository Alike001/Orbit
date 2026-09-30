# Orbit Merchant API

The Orbit Merchant API (`apps/backend/index.js`) is an Express service that manages pricing plans, customer subscriptions, and automated on-chain pull executions on Stellar Soroban. Data is persisted in Supabase using the tables defined in `apps/backend/schema.sql` (`merchants`, `plans`, `subscriptions`).

## Setup and Configuration

### Prerequisites

- Node.js 18+ and npm 9+
- A Supabase project with tables initialized via `apps/backend/schema.sql`
- A deployed Orbit Soroban contract on Stellar Testnet

### Environment Variables

Copy `apps/backend/.env.example` to `apps/backend/.env` and configure:

| Variable | Description | Example |
|---|---|---|
| `PORT` | Local port for Express server (defaults to 3001) | `3001` |
| `SUPABASE_URL` | Supabase project URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key | `eyJhbGciOi...` |
| `ORBIT_CONTRACT_ID` | Deployed Orbit Soroban smart contract ID | `CAZBZBUWBSQYK2RZ6WHMXVDLIQHSU5WD7ANZYL6HLNSCRUOTNYCDYQNG` |

### Running the API

```bash
cd apps/backend
npm install
node index.js
```

The service runs at `http://localhost:3001`.

---

## API Routes Overview

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/plans` | Create a new recurring pricing plan |
| `GET` | `/plans/:id` | Fetch plan and merchant details |
| `GET` | `/subscribers` | List active subscribers for a merchant |
| `POST` | `/trigger-pull` | Execute on-chain pull payment on Soroban |
| `POST` | `/subscriptions` | Record a customer subscription after handshake |

---

## Route Reference

### 1. POST /plans

#### Purpose
Creates a new recurring subscription plan for a merchant.

#### Request Body
Content-Type: `application/json`

| Field | Type | Required | Description |
|---|---|---|---|
| `merchant_id` | `string` (UUID) | Yes | Unique ID of the merchant creating the plan (must exist in `merchants` table). |
| `name` | `string` | Yes | Name of the subscription plan (e.g., `"Pro Plan - 29 USDC/month"`). |
| `usdc_amount` | `number` | Yes | Billing amount in USDC per interval (e.g., `29`). |
| `interval_seconds` | `number` | Yes | Cadence between billing pulls in seconds (e.g., `2592000` for 30 days). |

#### Example Request

```bash
curl -X POST http://localhost:3001/plans \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "name": "Pro Plan - 29 USDC/month",
    "usdc_amount": 29,
    "interval_seconds": 2592000
  }'
```

#### Example Success Response
Status: `201 Created`

```json
{
  "message": "Plan created successfully",
  "plan": {
    "id": "e2a0b3df-2015-4672-9721-a1e94c1408d7",
    "merchant_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "name": "Pro Plan - 29 USDC/month",
    "usdc_amount": 29,
    "interval_seconds": 2592000,
    "created_at": "2026-09-30T00:00:00.000Z"
  }
}
```

#### Error Responses

- `400 Bad Request`
  Returned when any required field (`merchant_id`, `name`, `usdc_amount`, `interval_seconds`) is missing.
  ```json
  {
    "error": "Missing required fields"
  }
  ```

- `500 Internal Server Error`
  Returned if the database query fails or a foreign key constraint is violated.
  ```json
  {
    "error": "insert or update on table \"plans\" violates foreign key constraint \"plans_merchant_id_fkey\""
  }
  ```

---

### 2. GET /plans/:id

#### Purpose
Fetches details of a specific plan along with the associated merchant's name and Stellar wallet address. Used by checkout widgets and payment pages.

#### URL Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `string` (UUID) | Yes | Unique ID of the plan to fetch. |

#### Example Request

```bash
curl http://localhost:3001/plans/e2a0b3df-2015-4672-9721-a1e94c1408d7
```

#### Example Success Response
Status: `200 OK`

```json
{
  "plan": {
    "id": "e2a0b3df-2015-4672-9721-a1e94c1408d7",
    "merchant_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "name": "Pro Plan - 29 USDC/month",
    "usdc_amount": 29,
    "interval_seconds": 2592000,
    "created_at": "2026-09-30T00:00:00.000Z",
    "merchants": {
      "name": "Acme SaaS",
      "wallet_address": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    }
  }
}
```

#### Error Responses

- `404 Not Found`
  Returned if no plan exists with the given ID.
  ```json
  {
    "error": "Plan not found"
  }
  ```

- `500 Internal Server Error`
  Returned if the database query fails or the ID syntax is invalid.
  ```json
  {
    "error": "invalid input syntax for type uuid: \"invalid-id\""
  }
  ```

---

### 3. GET /subscribers

#### Purpose
Fetches all active subscriptions across plans owned by a specific merchant, used by the merchant dashboard.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `merchant_id` | `string` (UUID) | Yes | Unique ID of the merchant whose subscribers are queried. |

#### Example Request

```bash
curl "http://localhost:3001/subscribers?merchant_id=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
```

#### Example Success Response
Status: `200 OK`

```json
{
  "subscribers": [
    {
      "id": "c1f7b9e0-1234-5678-9abc-def012345678",
      "plan_id": "e2a0b3df-2015-4672-9721-a1e94c1408d7",
      "customer_wallet_address": "GD3AGJRMLRKRTQKBVMLT6AW34IZZ3IEALRHTY247BBNISVS452SMQDPG",
      "status": "active",
      "next_billing_date": "2026-10-30T00:00:00.000Z",
      "created_at": "2026-09-30T00:00:00.000Z",
      "plans": {
        "merchant_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "name": "Pro Plan - 29 USDC/month",
        "usdc_amount": 29
      }
    }
  ]
}
```

#### Error Responses

- `400 Bad Request`
  Returned when the `merchant_id` query parameter is missing.
  ```json
  {
    "error": "Missing merchant_id query parameter"
  }
  ```

- `500 Internal Server Error`
  Returned if the database query fails.
  ```json
  {
    "error": "invalid input syntax for type uuid: \"invalid-merchant-id\""
  }
  ```

---

### 4. POST /trigger-pull

#### Purpose
Executes an on-chain pull payment on the Stellar Soroban network for a given subscription.

The flow:
1. Loads subscription, plan terms, and merchant wallet address from Supabase.
2. Derives the merchant Keypair from `merchant_secret` and verifies it matches the plan owner.
3. Builds the Soroban transaction invoking `pull_funds(user, merchant)` on the Orbit contract.
4. Prepares (simulates), signs, and submits the transaction to Soroban RPC.
5. Updates `next_billing_date` in Supabase to `pull_time + interval_seconds`.

#### Request Body
Content-Type: `application/json`

| Field | Type | Required | Description |
|---|---|---|---|
| `subscription_id` | `string` (UUID) | Yes | Unique ID of the subscription to pull funds for. |
| `merchant_secret` | `string` | Yes | Stellar secret key (`S...`) of the merchant owning the plan. |

#### Example Request

```bash
curl -X POST http://localhost:3001/trigger-pull \
  -H "Content-Type: application/json" \
  -d '{
    "subscription_id": "c1f7b9e0-1234-5678-9abc-def012345678",
    "merchant_secret": "SCZANGBA5YHTNYVVV4C3U252E2B6P6F5T3U6MM63WBSBZVYAYE6XYZTEST"
  }'
```

#### Example Success Response
Status: `200 OK`

```json
{
  "message": "Successfully pulled funds on-chain!",
  "txHash": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"
}
```

#### Error Responses

- `400 Bad Request`
  Returned when `subscription_id` or `merchant_secret` is missing.
  ```json
  {
    "error": "Missing subscription_id or merchant_secret"
  }
  ```

- `401 Unauthorized`
  Returned when the provided `merchant_secret` does not match the merchant wallet registered for the plan.
  ```json
  {
    "error": "Merchant secret does not match the plan owner's address"
  }
  ```

- `404 Not Found`
  Returned when the subscription record does not exist.
  ```json
  {
    "error": "Subscription not found"
  }
  ```

- `500 Internal Server Error`
  Returned when `ORBIT_CONTRACT_ID` is not set in `.env`, or the Soroban transaction build, simulation, or submission fails (e.g., interval not elapsed, insufficient allowance).
  ```json
  {
    "error": "ORBIT_CONTRACT_ID not set in .env"
  }
  ```
  ```json
  {
    "error": "Transaction failed: {\"status\":\"FAILED\"}"
  }
  ```

---

### 5. POST /subscriptions

#### Purpose
Records a customer subscription after the customer has executed the on-chain allowance approval and vault creation handshake with the Orbit contract.

Sets `next_billing_date` to the current timestamp (`new Date().toISOString()`), enabling the initial pull immediately.

#### Request Body
Content-Type: `application/json`

| Field | Type | Required | Description |
|---|---|---|---|
| `plan_id` | `string` (UUID) | Yes | Unique ID of the plan being subscribed to. |
| `customer_wallet_address` | `string` | Yes | Stellar public key (`G...`) of the subscriber. |

#### Example Request

```bash
curl -X POST http://localhost:3001/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "e2a0b3df-2015-4672-9721-a1e94c1408d7",
    "customer_wallet_address": "GD3AGJRMLRKRTQKBVMLT6AW34IZZ3IEALRHTY247BBNISVS452SMQDPG"
  }'
```

#### Example Success Response
Status: `201 Created`

```json
{
  "message": "Subscription created",
  "subscription": {
    "id": "c1f7b9e0-1234-5678-9abc-def012345678",
    "plan_id": "e2a0b3df-2015-4672-9721-a1e94c1408d7",
    "customer_wallet_address": "GD3AGJRMLRKRTQKBVMLT6AW34IZZ3IEALRHTY247BBNISVS452SMQDPG",
    "status": "active",
    "next_billing_date": "2026-09-30T00:00:00.000Z",
    "created_at": "2026-09-30T00:00:00.000Z"
  }
}
```

#### Error Responses

- `400 Bad Request`
  Returned when `plan_id` or `customer_wallet_address` is missing.
  ```json
  {
    "error": "Missing required fields"
  }
  ```

- `500 Internal Server Error`
  Returned if the database query fails or the customer is already subscribed to the plan (unique constraint violation on `(plan_id, customer_wallet_address)`).
  ```json
  {
    "error": "duplicate key value violates unique constraint \"subscriptions_plan_id_customer_wallet_address_key\""
  }
  ```

---

## Database Schema Reference

The API queries three primary tables defined in `apps/backend/schema.sql`:

- `merchants`: `id` (UUID PK), `wallet_address` (VARCHAR UNIQUE), `name` (VARCHAR), `created_at` (TIMESTAMP).
- `plans`: `id` (UUID PK), `merchant_id` (UUID FK -> `merchants.id`), `name` (VARCHAR), `usdc_amount` (NUMERIC), `interval_seconds` (BIGINT), `created_at` (TIMESTAMP).
- `subscriptions`: `id` (UUID PK), `plan_id` (UUID FK -> `plans.id`), `customer_wallet_address` (VARCHAR), `status` (VARCHAR DEFAULT 'active'), `next_billing_date` (TIMESTAMP), `created_at` (TIMESTAMP).

---

## Response and Error Conventions

- All JSON responses return UTF-8 encoded text.
- Successful mutations return `201 Created` with a `message` and entity payload (`plan`, `subscription`).
- Successful queries return `200 OK` with an entity or collection payload (`plan`, `subscribers`).
- Errors return an appropriate HTTP status code (`400`, `401`, `404`, `500`) with a JSON payload of shape:
  ```json
  {
    "error": "Error description message"
  }
  ```
