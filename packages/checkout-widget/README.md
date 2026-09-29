# Orbit Checkout Widget

`<OrbitCheckout />` is an embeddable React checkout component for the Orbit pull-payment protocol on Stellar Soroban. It displays recurring subscription plan terms (plan name, merchant name, USDC price per cycle, and billing interval in days), connects the subscriber's Freighter wallet, and records the subscription with the Orbit Merchant API.

## Running Locally

From the repository root, install dependencies and start the Vite development server:

```bash
cd packages/checkout-widget
npm install
npm run dev
```

The standalone SDK preview app (`src/App.jsx`) starts on `http://localhost:5173` and lets you switch between preset plans (`plan_pro`, `plan_community`, `plan_enterprise`) to test the checkout flow.

Other available scripts in `package.json`:

- `npm run dev` - start the local Vite dev server on `http://localhost:5173`
- `npm run build` - build the production bundle with Vite
- `npm run preview` - preview the production build locally

## Props

`<OrbitCheckout />` (`src/OrbitCheckout.jsx`) accepts three props. Supply either `planId` (to load plan details from the Merchant API) or `planData` (to pass preloaded plan details directly).

| Prop | Type | Default | Description |
|---|---|---|---|
| `planId` | `string` | `undefined` | Identifier of the subscription plan. Used to fetch plan details from `GET {apiUrl}/plans/{planId}` when `planData` is not provided, and sent as `plan_id` in `POST {apiUrl}/subscriptions`. |
| `planData` | `object` | `undefined` | Preloaded plan object. When provided, the widget skips the `GET /plans/:id` network call and renders immediately. |
| `apiUrl` | `string` | `'http://localhost:3001'` | Base URL of the Orbit Merchant API used for `GET /plans/:id` and `POST /subscriptions`. |

### `planData` Object Shape

```js
{
  id: "plan_pro",                  // string: plan identifier
  name: "Pro Developer Membership",// string: display title
  usdc_amount: 490000000,          // number: raw USDC units (7 decimals; 490000000 = 49.00 USDC)
  interval_seconds: 2592000,       // number: billing interval in seconds (2592000 = 30 days)
  merchants: {
    name: "Drips Labs"             // string: merchant display name
  }
}
```

### Prop Examples

Fetching a plan from the Merchant API using `planId` and `apiUrl`:

```jsx
<OrbitCheckout
  planId="plan_pro"
  apiUrl="http://localhost:3001"
/>
```

Passing a preloaded plan object with `planData`:

```jsx
<OrbitCheckout
  planId="plan_pro"
  planData={{
    id: "plan_pro",
    name: "Pro Developer Membership",
    usdc_amount: 490000000,
    interval_seconds: 2592000,
    merchants: { name: "Drips Labs" }
  }}
  apiUrl="http://localhost:3001"
/>
```

## Freighter Wallet Requirement

The widget uses `@stellar/freighter-api` (`isConnected` and `requestAccess`) to connect to the subscriber's Stellar wallet in the browser:

1. Install the [Freighter browser extension](https://www.freighter.app/) and configure it for Stellar Testnet (`Test SDF Network ; September 2015`).
2. When the user clicks **Connect Freighter Wallet**, the widget checks `await isConnected()` and calls `await requestAccess()` to retrieve the subscriber's Stellar public key (`G...`).
3. If the Freighter extension is not installed or connection fails during local preview, the widget falls back to a demo public key (`GBXQ4T7W91LK3PMZ0VR82C5E7NDF6U9H4YJ2A8S`) so the UI flow can still be inspected offline.

## React Embed Example

```jsx
import React from 'react';
import OrbitCheckout from './OrbitCheckout';

export default function PricingCard() {
  return (
    <div>
      <OrbitCheckout
        planId="plan_pro"
        apiUrl="http://localhost:3001"
      />
    </div>
  );
}
```

Or with inline `planData` (as used in `src/App.jsx`):

```jsx
import React from 'react';
import OrbitCheckout from './OrbitCheckout';

const plan = {
  id: 'plan_pro',
  name: 'Pro Developer Membership',
  usdc_amount: 490000000,
  interval_seconds: 2592000,
  merchants: { name: 'Drips Labs' }
};

export default function DemoCheckout() {
  return <OrbitCheckout planId={plan.id} planData={plan} />;
}
```

## Merchant API Routes Called

`<OrbitCheckout />` communicates with two endpoints on the Merchant API (`apps/backend/index.js`):

### 1. `GET /plans/:id`

Called on mount when `planData` is not passed and `planId` is defined.

- **Request:** `GET {apiUrl}/plans/{planId}`
- **Expected Response (`200 OK`):**
  ```json
  {
    "plan": {
      "id": "plan_pro",
      "name": "Pro Developer Membership",
      "usdc_amount": 490000000,
      "interval_seconds": 2592000,
      "merchants": {
        "name": "Drips Labs"
      }
    }
  }
  ```
- **Offline Fallback:** If the request fails (for example, when running the widget without the backend), the component logs a warning and falls back to a default demo plan so standalone previews continue to work.

### 2. `POST /subscriptions`

Called when a connected user clicks **Subscribe & Approve**.

- **Request:** `POST {apiUrl}/subscriptions`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "plan_id": "plan_pro",
    "customer_wallet_address": "G..."
  }
  ```
- **Offline Fallback:** Network errors when the backend is unreachable in standalone test mode are caught so the approval state transition can still be previewed.
