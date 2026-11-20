/**
 * Mobile wallet detection and deep-linking helpers for checkout on phones (#220).
 *
 * Browser extensions (Freighter, xBull) do not exist on mobile Safari/Chrome, so the
 * widget needs a mobile-native path: detect the device, offer wallets that actually
 * work there, and recover widget state when the user switches back from a wallet app.
 */

const IOS_UA_PATTERN = /iPhone|iPad|iPod/i;
const ANDROID_UA_PATTERN = /Android/i;
const GENERIC_MOBILE_UA_PATTERN = /Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini/i;

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  if (IOS_UA_PATTERN.test(navigator.userAgent)) return true;
  // iPadOS 13+ requests the desktop UA string but keeps multi-touch + a Mac platform string.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroid() {
  return typeof navigator !== 'undefined' && ANDROID_UA_PATTERN.test(navigator.userAgent);
}

export function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return isIOS() || isAndroid() || GENERIC_MOBILE_UA_PATTERN.test(navigator.userAgent);
}

// LOBSTR and Hana both ship native apps with their own (undocumented) URL schemes.
// Opening one costs nothing when the app isn't installed - the navigation just no-ops -
// so we attempt it and fall back to the store listing/WalletConnect on a short timeout.
export const MOBILE_WALLET_APPS = {
  lobstr: {
    id: 'lobstr',
    name: 'LOBSTR',
    scheme: 'lobstr://',
    iosStoreUrl: 'https://apps.apple.com/app/id1404357892',
    androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.lobstr.client',
  },
  hana: {
    id: 'hana',
    name: 'Hana Wallet',
    scheme: 'hanawallet://',
    iosStoreUrl: 'https://apps.apple.com/app/id6447821572',
    androidStoreUrl: 'https://hanawallet.io/',
  },
};

export function mobileAppStoreUrl(walletId) {
  const app = MOBILE_WALLET_APPS[walletId];
  if (!app) return null;
  if (isIOS()) return app.iosStoreUrl;
  return app.androidStoreUrl || app.iosStoreUrl;
}

/**
 * Best-effort universal deep link into a wallet app's own URL scheme.
 * `onMissing` fires if the page is still in the foreground after `timeoutMs`, which is the
 * expected outcome whenever that scheme isn't registered - callers must treat it as a normal
 * path (show an install link / offer WalletConnect), not an error.
 * Returns a cancel function that stops the pending timeout/listeners.
 */
export function openMobileWalletApp(walletId, { timeoutMs = 1500, onMissing } = {}) {
  const app = MOBILE_WALLET_APPS[walletId];
  if (!app || typeof window === 'undefined' || typeof document === 'undefined') {
    onMissing?.();
    return () => {};
  }

  let settled = false;
  let timer;
  const finish = (missing) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    if (missing) onMissing?.();
  };
  // The OS backgrounds our tab the instant it hands off to the installed app, so either
  // of these firing before the timeout means the deep link worked.
  const onHide = () => { if (document.hidden) finish(false); };

  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  timer = setTimeout(() => finish(true), timeoutMs);
  window.location.href = app.scheme;

  return () => finish(false);
}

/**
 * Lazily builds a WalletConnect module so its (sizeable) dependency tree only loads for
 * merchants who configured a project ID. WalletConnect is the one mechanism here that is a
 * real, wallet-agnostic standard: pairing happens over the WalletConnect relay, so the signed
 * result comes back to this same page without needing our own callback server, and its modal
 * deep-links straight into whichever supported wallet (LOBSTR, Hana, etc.) the user has installed.
 */
export async function createWalletConnectModule({ projectId, networkPassphrase, appName, appUrl }) {
  if (!projectId) throw new Error('A WalletConnect project ID is required.');
  const [{ WalletConnectModule, WalletConnectTargetChain }, { Networks }] = await Promise.all([
    import('@creit.tech/stellar-wallets-kit/modules/wallet-connect'),
    import('@stellar/stellar-sdk'),
  ]);
  return new WalletConnectModule({
    projectId,
    metadata: {
      name: appName || 'Orbit Checkout',
      description: 'Subscribe with a non-custodial Stellar wallet.',
      url: appUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://orbit.xyz'),
      icons: [],
    },
    allowedChains: [networkPassphrase === Networks.PUBLIC ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET],
  });
}
