/**
 * Cross-chain bridge entry point (#223): lets a customer who holds USDC on Ethereum,
 * Polygon, Arbitrum or Solana bridge it into their connected Stellar address, then
 * resumes checkout once the funds land - without them having to bridge manually first.
 *
 * This deliberately does not claim to embed a bridge iframe. Two things were verified
 * directly against Allbridge's own deployed assets before writing this:
 *  - Allbridge Core's embeddable widget (corewidget.allbridge.io, documented at
 *    github.com/allbridge-io/allbridge-core-widget) only lists BSC/ETH/POL/SOL/TRX as
 *    chains in its deployed bundle - Stellar is not one of its options.
 *  - The Allbridge app that does support Stellar (its Core SDK defines
 *    `ChainSymbol.STLR`, and Allbridge publicly launched Stellar connectivity in 2023)
 *    serves `X-Frame-Options: DENY`, so it refuses to load inside an iframe at all.
 * So there is no Stellar-capable Allbridge surface that can legally be embedded as an
 * in-page modal today. This opens the real app in a new tab instead (the same
 * new-tab pattern this widget already uses for the mobile handover link) and watches
 * the destination Stellar address for the bridged balance to arrive, the way
 * `mobileHandover.js` watches a handover session.
 */

export const BRIDGE_SOURCE_CHAINS = [
  { id: 'ETH', name: 'Ethereum' },
  { id: 'POL', name: 'Polygon' },
  { id: 'ARB', name: 'Arbitrum' },
  { id: 'SOL', name: 'Solana' },
];

// Allbridge's Core SDK chain symbol for Stellar/Soroban (`ChainSymbol.STLR`).
const ALLBRIDGE_STELLAR_SYMBOL = 'STLR';

/**
 * `f`/`t`/`ft`/`tt` match the query parameters Allbridge documents for its embeddable
 * Core Widget (source/destination chain, source/destination token). Its full app isn't
 * documented to accept the same params, but it shares the same chain-selection code, so
 * this is a best-effort deep link, not a guarantee - the destination address box below
 * is what actually protects the transfer, not this URL.
 */
export function allbridgeUrl(sourceChainId) {
  const params = new URLSearchParams({ f: sourceChainId, t: ALLBRIDGE_STELLAR_SYMBOL, ft: 'USDC', tt: 'USDC' });
  return `https://app.allbridge.io/bridge?${params.toString()}`;
}

export const BRIDGE_WATCH_POLL_MS = 6000;
export const BRIDGE_WATCH_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Polls `fetchBalance` for a USDC balance above `baseline`, mirroring the
 * start/poll/stop shape of `watchHandover` in mobileHandover.js.
 */
export function watchForBridgedFunds({
  fetchBalance, baseline, onArrived, onTimeout, onError,
  pollMs = BRIDGE_WATCH_POLL_MS, timeoutMs = BRIDGE_WATCH_TIMEOUT_MS, clock = Date.now,
}) {
  const startedAt = clock();
  let active = true;
  let busy = false;
  let intervalId;
  const stop = () => { active = false; if (intervalId) clearInterval(intervalId); };
  const poll = async () => {
    if (!active || busy) return;
    if (clock() - startedAt >= timeoutMs) { stop(); onTimeout?.(); return; }
    busy = true;
    try {
      const balance = await fetchBalance();
      if (!active) return;
      if (balance > baseline) { stop(); onArrived?.(balance); }
    } catch (error) {
      if (active) onError?.(error);
    } finally { busy = false; }
  };
  intervalId = setInterval(poll, pollMs);
  poll();
  return { stop };
}
