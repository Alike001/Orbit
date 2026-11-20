# Orbit Checkout Widget

`<OrbitCheckout />` is an embeddable React checkout for Orbit pull payments on Stellar Soroban. It loads a plan, lets the customer choose a supported wallet, signs the USDC `approve` and Orbit `create_vault` transactions, waits for both to confirm, and only then records the subscription with the Merchant API.

## Supported wallets

The widget configures only these tree-shakeable modules from Stellar Wallets Kit:

- Freighter
- Albedo
- Lobstr
- Hana
- xBull

The selected wallet is persisted in `localStorage`. Use `allowedWallets` to expose a subset.

## Setup

```bash
cd packages/checkout-widget
npm install
npm run dev
```

Configure the public Vite environment:

```dotenv
VITE_ORBIT_CONTRACT_ID=C...
VITE_USDC_CONTRACT_ID=C...
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

## Props

| Prop | Default | Description |
|---|---|---|
| `planId` | — | Plan UUID loaded from `GET /plans/:id`. |
| `planData` | — | Preloaded plan; must include the merchant wallet address. |
| `apiUrl` | `http://localhost:3001` | Merchant API base URL. |
| `allowedWallets` | all five wallets | Array of Stellar Wallets Kit wallet IDs. |
| `demo` | `false` | Adds an explicitly labelled offline preview option. It never signs or records a subscription. |
| `orbitContractId` | `VITE_ORBIT_CONTRACT_ID` | Orbit contract address. |
| `tokenContractId` | `VITE_USDC_CONTRACT_ID` | USDC SAC address. |
| `rpcUrl` | Stellar testnet RPC | Soroban JSON-RPC endpoint. |
| `networkPassphrase` | Stellar testnet | Network used for signing. |
| `theme` | `auto` | `dark`, `light`, or `auto`. |
| `accentColor` | `#6366f1` | Hex color for buttons and active states. |
| `borderRadius` | `md` | `none`, `sm`, `md`, `lg`, or `full`. |
| `fontFamily` | `inherit` | CSS font family or font stack. |
| `customClasses` | `{}` | Optional `{ modal, header, button }` class names. |
| `allowedOrigins` | `[]` | Trusted parent origins for lifecycle `postMessage` events. Empty permits same-origin parent only. |
| `walletConnectProjectId` | `VITE_WALLETCONNECT_PROJECT_ID` | [WalletConnect Cloud](https://cloud.reown.com) project ID. Enables the WalletConnect option, which is the only guaranteed path to deep-link a signing session into an installed mobile wallet app without the user leaving the checkout tab permanently. Omit it and the WalletConnect option is hidden. |
| `termsUrl` | — | Link target for "Terms of Service" inside the consent checkbox. Plain text if omitted. |
| `privacyUrl` | — | Link target for "Privacy Policy" inside the consent checkbox. Omitted from the sentence entirely if not set. |
| `requireConsent` | `false` | When `true`, renders a mandatory legal disclosure checkbox and disables every wallet-connection and subscribe button until it is checked. |

```jsx
<OrbitCheckout
  planId="e2a0b3df-2015-4672-9721-a1e94c1408d7"
  apiUrl="http://localhost:3001"
  allowedWallets={["freighter", "albedo", "lobstr", "hana", "xbull"]}
/>
```

The allowance covers 12 billing cycles and expires after those cycles plus a ledger safety margin. If either wallet transaction fails or is rejected, `POST /subscriptions` is not called and the error remains visible in the widget.

Before signatures, the widget simulates the USDC `approve` and Orbit `create_vault` transactions, reads USDC/XLM balances, and displays estimated fees. In-flight hashes are backed up in local storage and can be checked again after a refresh or a long network delay.

## Coupon codes (#222)

A collapsible "Have a coupon code?" link reveals a code input and an Apply button. Applying calls the public `POST /coupons/validate` endpoint (`{ plan_id, code }`, no API key required) and, on a `{ valid: true, ... }` response, replaces the price with a struck-through original amount, the discounted amount, and a "N% OFF applied" pill computed from the returned `savings`/`original_amount`. The validated, server-normalized `code` is sent back as `coupon_code` in the `POST /subscriptions` payload, which the backend redeems atomically via `redeem_coupon_subscription` (see `apps/backend/coupons.js`).

**This discounts the checkout price quote and the subscription record only.** The backend marks these subscriptions `pending_promo` with `promotion_onchain_verified: false` - the Stellar vault `approve`/`create_vault` transactions the widget asks the customer to sign still authorize the plan's full on-chain amount (`plan.usdc_amount`), because the current contract has no compatible promo-vault terms (`onchain_enforcement: 'requires-compatible-vault'` in the validate response). Do not wire `appliedCoupon.discounted_amount` into `soroban.js`'s `authorizePlan`/`preflightPlan` calls without first confirming the deployed contract actually enforces it - otherwise the signed authorization would silently diverge from what's displayed.

A coupon is cleared automatically if the selected plan changes (switching presets, a fresh `planId`/`planData`), since a code validated for one plan is not valid for another.

## Lifecycle events

The checkout's typed financial callbacks use a verified parent-window handshake (documented below). Set explicit `allowedOrigins` values for cross-origin embeds; unverified parents receive no lifecycle callbacks.

| Event | Payload |
|---|---|
| `orbit:ready` | `{ type, planId }` |
| `orbit:wallet_connected` | `{ type, address }` |
| `orbit:subscribed` | `{ type, subscriptionId, planId, txHash, couponCode? }` |
| `orbit:error` | `{ type, message }` |
| `orbit:close` | `{ type }` |
| `orbit:bridge_funds_arrived` | `{ type, address, balance }` |

```js
// See the authenticated ORBIT_CHECKOUT_* callback sample below.
// Never provision from an unauthenticated client-side message.
```


## Merchant branding, balance diagnostics, and iframe security (#238–#240)

### Brand configuration

`theme` also accepts a scoped object. The legacy string `theme="auto"`, `accentColor`, `borderRadius`, and `fontFamily` props remain supported. Missing values fall back to Orbit defaults; invalid CSS colors and non-HTTP(S) logo URLs are ignored.

```jsx
<OrbitCheckout
  planId="your-plan-id"
  theme={{
    mode: "dark",
    primaryColor: "#6366f1",
    backgroundColor: "#171923",
    borderRadius: "md",
    fontFamily: "Inter, sans-serif",
    logoUrl: "https://merchant.example/logo.svg",
  }}
  allowedOrigins={["https://merchant.example"]}
/>
```

All `--orbit-*` custom properties are written on the `.orbit-checkout-root` element, not the host document or iframe parent's root. Merchants can use `mode: "light"` or `"dark"`.

### USDC balance and trustline pre-flight

After wallet connection, Horizon is queried for the **specific network's USDC issuer**. The inline status distinguishes uninitialized wallets, missing/unauthorized trustlines, insufficient USDC (with an exact 7-decimal shortfall), and ready accounts. The main USDC signing button is disabled while verification is pending or unmet; "Recheck USDC" refreshes the result. Add the asset trustline using your wallet's asset management UI or fund the wallet, then recheck. This is a read-only check: Orbit does not add a trustline or auto-sign a transaction. Non-USDC swap checkout retains its separate swap-quote validation. There is a second live check on click, before any signer is called, to reduce stale-balance errors. Network/RPC availability can still change between the check and final submission.

### Secure iframe postMessage handshake

For a cross-origin embedding, pass the exact registered merchant origin via `allowedOrigins` (do not use `*`). The parent page **must** install its listener before the iframe loads, verify `event.origin` and `event.source`, then echo the per-mount nonce in `ORBIT_CHECKOUT_ACK`. Before a valid acknowledgment the checkout emits no success/failure/close callback.

```js
const iframe = document.querySelector('#orbit-checkout');
const checkoutOrigin = 'https://checkout.orbit.example'; // replace with your deployed checkout origin
window.addEventListener('message', (event) => {
  if (event.origin !== checkoutOrigin || event.source !== iframe.contentWindow) return;
  const message = event.data;
  if (message?.type === 'ORBIT_CHECKOUT_HELLO' && typeof message.nonce === 'string') {
    iframe.contentWindow.postMessage({
      type: 'ORBIT_CHECKOUT_ACK',
      nonce: message.nonce,
    }, checkoutOrigin);
    return;
  }
  if (message?.type === 'ORBIT_CHECKOUT_SUCCESS') {
    // { type, vaultId, transactionHash, timestamp, nonce }
    // Always verify the transaction with your backend before provisioning.
    console.info('Checkout completed', message.transactionHash);
  } else if (message?.type === 'ORBIT_CHECKOUT_FAILED') {
    // { type, code, message, nonce }
    console.error(message.code, message.message);
  } else if (message?.type === 'ORBIT_CHECKOUT_CLOSED') {
    // { type, nonce }
    console.info('Checkout dismissed');
  }
});
```

The parent must not trust iframe callbacks alone as a payment proof: verify the Stellar transaction, merchant, and vault on the server. The listener in the checkout checks both the parent window identity and exact allowed origin, rejects wrong nonces, validates outgoing event payloads, and tears down on unmount. Use a dedicated registered merchant origin to avoid granting sibling applications on the same origin access.

## Desktop-to-mobile QR handover (#210)

The checkout now offers **Scan with Mobile Wallet** alongside browser wallet selection. It opens a server-backed session with 24 bytes of cryptographically secure randomness and a strict five-minute expiry. The QR contains a URL back to the **same live checkout page**, with an `orbit_handover` query parameter. The widget on the mobile page reloads the plan from the server, letting the customer connect using a supported Stellar mobile DApp browser (e.g. the LOBSTR app browser or Albedo mobile flow).

**Integration requirement:** The QR's destination must be reachable from a phone, must render the same `<OrbitCheckout />` widget, and must be able to access the Merchant API using HTTPS. An `http://localhost` merchant page works only for local single-device testing. This is a web handover, not a fabricated WalletConnect pairing or unsupported wallet-native transaction URI.

After mobile wallet signing succeeds, the API first records a subscription, then `POST /handover/sessions/:id/complete` checks the Stellar RPC transaction **SUCCESS**, its ledger, vault-creation event, token, payout amount, interval, merchant, and customer address against the server's plan and subscription records. Only then does the desktop polling flow show a GSAP-animated receipt. Session state expires after five minutes; the widget stops polling cleanly.

The backend requires `ORBIT_CONTRACT_ID`, `USDC_CONTRACT_ID`, `SOROBAN_RPC_URL` and a working payment database. Set `REDIS_URL` in horizontally scaled environments so independent API replicas share the expiring session state. Otherwise the built-in memory fallback is **single-process only**.

## Mobile deep-linking (#220)

A phone has no browser extensions, so Freighter and xBull cannot connect there - the widget detects a mobile browser (`src/mobileWallet.js`) and swaps the wallet list accordingly:

- **Scanning a QR code is hidden on mobile** (you can't scan your own screen with your own camera); the desktop-to-mobile handover above remains available on desktop.
- **WalletConnect** (set `walletConnectProjectId` / `VITE_WALLETCONNECT_PROJECT_ID`) is the reliable path: pairing happens over the WalletConnect relay, so the signed result comes back into the same tab without a redirect, and its own modal deep-links into whichever installed wallet supports it (LOBSTR, Hana Wallet and others).
- **"Open in LOBSTR app" / "Open in Hana app"** attempt each wallet's own URL scheme (`lobstr://`, `hanawallet://`) directly. Neither scheme is documented or guaranteed, so this is a best-effort deep link: if the app doesn't intercept it within ~1.5s (detected via the page staying in the foreground), the widget shows an install link and suggests WalletConnect instead - it never fails silently.
- **Albedo** already works in any mobile browser as-is (it signs via a hosted redirect, not an extension), so it stays in the wallet list unchanged.

**Return & state recovery:** before attempting a LOBSTR/Hana deep link, the widget persists `{ walletId, startedAt }` to `localStorage` under `orbit:mobile-connect-pending`. When the tab regains focus (`visibilitychange`) it retries connecting; if iOS reclaimed the tab and reloaded the page instead, the same key restores a "Waiting for LOBSTR…" banner on mount so the user isn't dropped back to a blank connect screen. The key expires after 10 minutes and is cleared on a successful connect, a cancel, or disconnect. This reuses the same recovery pattern as the existing `orbit:pending-transaction` submitted-transaction recovery below.

## Progressive Web App

`index.html` ships a `manifest.webmanifest`, themed icons and iOS PWA meta tags, and `src/main.jsx` registers `public/sw.js`. A standalone-hosted checkout page (for example the handover target page above) can be added to the home screen and keeps polling a submitted transaction via the service worker's background sync even if the tab is backgrounded while the user is away in a wallet app.

## Terms of Service / GDPR consent (#221)

Merchants in regulated jurisdictions (EU, UK, US) often must capture explicit consent to recurring billing before any wallet interaction. Set `requireConsent` to render:

> I agree to the [Terms of Service](#) and [Privacy Policy](#) and authorize recurring billing of 49.00 USDC every 30 days until cancelled.

filled in with the connected plan's live amount and billing interval. `termsUrl`/`privacyUrl` make "Terms of Service"/"Privacy Policy" links; either is plain text if its URL is omitted, and the Privacy Policy clause is left out entirely when `privacyUrl` isn't set.

While `requireConsent` is `true` and the checkbox is unchecked, every wallet-connection entry point (Connect wallet, Scan with Mobile Wallet, WalletConnect, LOBSTR/Hana app buttons, the smart-wallet/passkey options, and each listed extension wallet) and the final Subscribe/signature button are `disabled`. `subscribe()` and `handleOpenWallets()` also re-check consent internally before doing anything, so a disabled button being bypassed (e.g. a customized `customClasses.button` removing the visual disabled state) still cannot start a wallet connection or signature.

```jsx
<OrbitCheckout
  planId="e2a0b3df-2015-4672-9721-a1e94c1408d7"
  requireConsent
  termsUrl="https://example.com/terms"
  privacyUrl="https://example.com/privacy"
/>
```

## Cross-chain bridge (#223)

Once a Stellar wallet is connected, "Need USDC on Stellar? Bridge from Ethereum, Polygon, Arbitrum or Solana" opens a modal for customers who hold USDC on another chain. It shows the connected Stellar address (with a copy button) and a button per source chain that opens [Allbridge](https://allbridge.io) in a **new tab**, pre-selecting that source chain, Stellar as the destination, and USDC on both sides.

**This is a new-tab link, not an embedded iframe, and that was a deliberate, verified choice, not a shortcut:**
- Allbridge's embeddable Core Widget (`corewidget.allbridge.io`, documented at [github.com/allbridge-io/allbridge-core-widget](https://github.com/allbridge-io/allbridge-core-widget)) only lists `BSC`/`ETH`/`POL`/`SOL`/`TRX` as chains in its deployed bundle - Stellar is not one of its options, verified by inspecting its live JS bundle.
- The Allbridge app that does support Stellar (its Core SDK defines `ChainSymbol.STLR`, and Allbridge [publicly launched Stellar connectivity in 2023](https://stellar.org/press/allbridge-launch-connects-stellar-network-to-ethereum-solana-and-polygon)) serves `X-Frame-Options: DENY`, confirmed with a direct request - it refuses to load inside an iframe at all.

So there is currently no Stellar-capable Allbridge surface that can legally be embedded as an in-page modal. The `f`/`t`/`ft`/`tt` URL parameters used in `src/bridge.js` are Allbridge's own documented Core Widget parameters (source chain / destination chain / source token / destination token); they are a best-effort deep link into the full app, not a confirmed API for it, which is why the destination address is also shown in its own copy box rather than relied on to autofill via an undocumented URL parameter - pasting it is what actually protects the transfer.

**Handshake resume:** opening the modal immediately starts polling the connected address's Horizon account (`fetchPayWithBalances`, the same helper the "Pay with" selector uses) every 6 seconds for up to 30 minutes, the same start/poll/stop shape `mobileHandover.js` uses for the QR handover session. The watch keeps running if the modal is closed ("Keep watching in the background"). Once the USDC balance rises above what it was before bridging, the widget stops watching, refreshes the "Pay with" balances, dispatches `orbit:bridge_funds_arrived`, and surfaces a "ready to continue" banner - the checkout flow resumes on its own up to that point. **The final signature is still a manual click**: this widget never auto-fires a wallet signing prompt without a fresh user gesture (the same rule the consent and coupon features above rely on), so the customer still clicks Subscribe & Approve themselves once their bridged funds have landed.

Run `npm test` (unit tests) and `npm run build` for this package. Handover approval requires a real wallet transaction; offline/demo states cannot mark a session confirmed.
