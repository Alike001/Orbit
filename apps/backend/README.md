# Orbit Merchant API Reference

The Merchant API provides REST endpoints for merchants, the Checkout Widget, and recurring billing keepers to manage pricing plans, customer subscriptions, and on-chain pull payment transactions.

## Table of Contents

- [Overview](#overview)
- [Base URL & Setup](#base-url--setup)
- [Authentication & Validation](#authentication--validation)
- [Endpoints](#endpoints)
  - [POST /plans](#post-plans)
  - [GET /plans/:id](#get-plansid)
  - [GET /subscribers](#get-subscribers)
  - [POST /trigger-pull](#post-trigger-pull)
  - [POST /subscriptions](#post-subscriptions)
- [Database Schema Reference](#database-schema-reference)

---

## Overview

The Merchant API acts as an off-chain coordinator that connects Supabase storage with the Orbit Soroban smart contract on Stellar Testnet.

Key responsibilities:
- Managing pricing tiers (`plans`)
- Querying subscriber cohorts (`subscribers`)
- Recording subscription entries following client handshake transactions (`subscriptions`)
- Building, signing, and submitting the `pull_funds` contract invocation (`trigger-pull`)

---

## Base URL & Setup

By default, the server listens on port `3001` (or the `PORT` environment variable).

```
http://localhost:3001
```

### Required Environment Variables

Before starting the server, configure `apps/backend/.env`:

| Variable | Description |
|---|---|
| `PORT` | Local port for Express (default: `3001`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key |
| `ORBIT_CONTRACT_ID` | Deployed Orbit Soroban contract address |

Run the service:

```bash
cd apps/backend
npm install
npm run dev
```

---

## Authentication & Validation

- `GET` endpoints are unauthenticated for MVP integration with the frontend dashboard and checkout widget.
- `POST /trigger-pull` validates that the caller provides the private Stellar secret key (`merchant_secret`) matching the public wallet address of the plan's merchant.

All requests containing JSON bodies must include the `Content-Type: application/json` header.

---

## Endpoints

### POST /plans

Creates a new subscription pricing plan for a merchant.

- **Method:** `POST`
- **Path:** `/plans`
- **Purpose:** Registers a plan with designated recurring payment amount and billing frequency in seconds.

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `merchant_id` | string (UUID) | Yes | Foreign key referencing `merchants.id`. |
| `name` | string | Yes | Display name for the tier (e.g. "Pro Tier"). |
| `usdc_amount` | number / numeric | Yes | Price billed per interval in USDC. |
| `interval_seconds` | number / integer | Yes | Billing interval duration in seconds (e.g. `2592000` for 30 days). |

#### Example Request

```bash
curl -X POST http://localhost:3001/plans \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_id": "7f8b9a10-b2c3-4d5e-a6f7-112233445566",
    "name": "Pro Plan",
    "usdc_amount": 29,
    "interval_seconds": 2592000
  }'
```

#### Success Response (201 Created)

```json
{
  "message": "Plan created successfully",
  "plan": {
    "id": "e0b8e99b-5136-4d1d-9351-91a5db4fb056",
    "merchant_id": "7f8b9a10-b2c3-4d5e-a6f7-112233445566",
    "name": "Pro Plan",
    "usdc_amount": 29,
    "interval_seconds": 2592000,
    "created_at": "2026-09-30T02:00:00.000Z"
  }
}
```

#### Error Responses

- **400 Bad Request:** Missing one or more required fields (`merchant_id`, `name`, `usdc_amount`, `interval_seconds`).
  ```json
  {
    "error": "Missing required fields"
  }
  ```
- **500 Internal Server Error:** Database insert error or unhandled server exception.
  ```json
  {
    "error": "Database connection error"
  }
  ```

---

### GET /plans/:id

Retrieves plan specifications and parent merchant wallet details.

- **Method:** `GET`
- **Path:** `/plans/:id`
- **Purpose:** Supplies pricing terms and merchant destination wallet address to the Checkout Widget SDK and hosted checkout pages.

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | Unique identifier of the plan. |

#### Example Request

```bash
curl -X GET http://localhost:3001/plans/e0b8e99b-5136-4d1d-9351-91a5db4fb056
```

#### Success Response (200 OK)

```json
{
  "plan": {
    "id": "e0b8e99b-5136-4d1d-9351-91a5db4fb056",
    "merchant_id": "7f8b9a10-b2c3-4d5e-a6f7-112233445566",
    "name": "Pro Plan",
    "usdc_amount": 29,
    "interval_seconds": 2592000,
    "created_at": "2026-09-30T02:00:00.000Z",
    "merchants": {
      "name": "Orbit SaaS",
      "wallet_address": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
    }
  }
}
```

#### Error Responses

- **404 Not Found:** Plan with requested UUID does not exist.
  ```json
  {
    "error": "Plan not found"
  }
  ```
- **500 Internal Server Error:** Supabase lookup error or invalid UUID format.
  ```json
  {
    "error": "invalid input syntax for type uuid"
  }
  ```

---

### GET /subscribers

Lists active subscriptions across all plans owned by a merchant.

- **Method:** `GET`
- **Path:** `/subscribers`
- **Purpose:** Populates subscriber management tables and billing schedules in the Merchant Dashboard.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `merchant_id` | string (UUID) | Yes | Identifier of the merchant whose subscribers are queried. |

#### Example Request

```bash
curl -X GET "http://localhost:3001/subscribers?merchant_id=7f8b9a10-b2c3-4d5e-a6f7-112233445566"
```

#### Success Response (200 OK)

```json
{
  "subscribers": [
    {
      "id": "4a7f2e18-6c51-41b9-9cf3-90d1bf379b32",
      "plan_id": "e0b8e99b-5136-4d1d-9351-91a5db4fb056",
      "customer_wallet_address": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "status": "active",
      "next_billing_date": "2026-10-30T02:00:00.000Z",
      "created_at": "2026-09-30T02:00:00.000Z",
      "plans": {
        "merchant_id": "7f8b9a10-b2c3-4d5e-a6f7-112233445566",
        "name": "Pro Plan",
        "usdc_amount": 29
      }
    }
  ]
}
```

#### Error Responses

- **400 Bad Request:** `merchant_id` query parameter is missing.
  ```json
  {
    "error": "Missing merchant_id query parameter"
  }
  ```
- **500 Internal Server Error:** Database query failure.
  ```json
  {
    "error": "Database error details"
  }
  ```

---

### POST /trigger-pull

Submits an on-chain transaction invoking `pull_funds` on the Soroban smart contract.

- **Method:** `POST`
- **Path:** `/trigger-pull`
- **Purpose:** Acts as the automated keeper/bridge. Verifies merchant ownership, builds the Soroban transaction, submits it to Stellar Testnet RPC, and updates the subscription's `next_billing_date`.

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `subscription_id` | string (UUID) | Yes | Identifier of the subscription being charged. |
| `merchant_secret` | string | Yes | Stellar secret key (`S...`) used to sign the transaction. Must match the merchant wallet associated with the plan. |

#### Example Request

```bash
curl -X POST http://localhost:3001/trigger-pull \
  -H "Content-Type: application/json" \
  -d '{
    "subscription_id": "4a7f2e18-6c51-41b9-9cf3-90d1bf379b32",
    "merchant_secret": "SDEXAMPLESECRETKEYNOTREALFORTESTINGONLY1234567890ABCDEF"
  }'
```

#### Success Response (200 OK)

```json
{
  "message": "Successfully pulled funds on-chain!",
  "txHash": "a1f5924b18dfa73bc9281a8b9813de64c3917d23d8c11438f71c4faee202111b"
}
```

#### Error Responses

- **400 Bad Request:** Missing `subscription_id` or `merchant_secret`.
  ```json
  {
    "error": "Missing subscription_id or merchant_secret"
  }
  ```
- **401 Unauthorized:** Secret key's public address does not match the merchant record in the database.
  ```json
  {
    "error": "Merchant secret does not match the plan owner's address"
  }
  ```
- **404 Not Found:** `subscription_id` does not match any record.
  ```json
  {
    "error": "Subscription not found"
  }
  ```
- **500 Internal Server Error:** Contract ID missing from configuration, RPC failure, or contract execution revert (e.g. interval has not yet elapsed).
  ```json
  {
    "error": "ORBIT_CONTRACT_ID not set in .env"
  }
  ```

---

### POST /subscriptions

Registers a customer subscription after on-chain allowance and vault creation.

- **Method:** `POST`
- **Path:** `/subscriptions`
- **Purpose:** Records that a customer has signed the Soroban handshake for a plan. Sets `next_billing_date` to current timestamp so initial billing can be processed.

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `plan_id` | string (UUID) | Yes | UUID of the plan being subscribed to. |
| `customer_wallet_address` | string | Yes | Stellar public address (`G...`) of the subscriber. |

#### Example Request

```bash
curl -X POST http://localhost:3001/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "e0b8e99b-5136-4d1d-9351-91a5db4fb056",
    "customer_wallet_address": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  }'
```

#### Success Response (201 Created)

```json
{
  "message": "Subscription created",
  "subscription": {
    "id": "4a7f2e18-6c51-41b9-9cf3-90d1bf379b32",
    "plan_id": "e0b8e99b-5136-4d1d-9351-91a5db4fb056",
    "customer_wallet_address": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "status": "active",
    "next_billing_date": "2026-09-30T02:00:00.000Z",
    "created_at": "2026-09-30T02:00:00.000Z"
  }
}
```

#### Error Responses

- **400 Bad Request:** Missing `plan_id` or `customer_wallet_address`.
  ```json
  {
    "error": "Missing required fields"
  }
  ```
- **500 Internal Server Error:** Database error or unique constraint violation (e.g. duplicate active subscription for identical plan and customer address).
  ```json
  {
    "error": "duplicate key value violates unique constraint"
  }
  ```

---

## Database Schema Reference

The API queries three primary tables defined in `apps/backend/schema.sql`:

- `merchants`: `id` (UUID PK), `wallet_address` (VARCHAR UNIQUE), `name` (VARCHAR), `created_at` (TIMESTAMP).
- `plans`: `id` (UUID PK), `merchant_id` (UUID FK -> `merchants.id`), `name` (VARCHAR), `usdc_amount` (NUMERIC), `interval_seconds` (BIGINT), `created_at` (TIMESTAMP).
- `subscriptions`: `id` (UUID PK), `plan_id` (UUID FK -> `plans.id`), `customer_wallet_address` (VARCHAR), `status` (VARCHAR DEFAULT 'active'), `next_billing_date` (TIMESTAMP), `created_at` (TIMESTAMP).
