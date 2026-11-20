/**
 * Scoped, verified iframe transport. Explicit merchant origins are required for
 * cross-origin embeds; the fallback only permits the checkout's own origin.
 * Neither "*" nor a message from an unrelated window is trusted.
 */
export const CHECKOUT_EVENTS = Object.freeze({
  success: 'ORBIT_CHECKOUT_SUCCESS',
  failed: 'ORBIT_CHECKOUT_FAILED',
  closed: 'ORBIT_CHECKOUT_CLOSED',
});

export function normalizeMerchantOrigins(origins, selfOrigin) {
  const values = Array.isArray(origins) && origins.length ? origins : [selfOrigin];
  return [...new Set(values.filter((value) => {
    if (typeof value !== 'string') return false;
    try {
      const parsed = new URL(value);
      return parsed.origin === value && ['https:', 'http:'].includes(parsed.protocol);
    } catch { return false; }
  }))];
}

export function validCheckoutEvent(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
  if (message.type === CHECKOUT_EVENTS.success)
    return typeof message.vaultId === 'string' && message.vaultId.length > 0 &&
      typeof message.transactionHash === 'string' && message.transactionHash.length > 0 &&
      typeof message.timestamp === 'string' && !Number.isNaN(Date.parse(message.timestamp));
  if (message.type === CHECKOUT_EVENTS.failed)
    return typeof message.code === 'string' && message.code.length > 0 &&
      typeof message.message === 'string';
  if (message.type === CHECKOUT_EVENTS.closed) return true;
  return false;
}

export function createCheckoutMessageBridge({ windowRef, allowedOrigins = [], nonce, onVerified }) {
  const parent = windowRef?.parent;
  if (!windowRef || !parent || parent === windowRef) return { send: () => false, dispose: () => {} };
  const origins = normalizeMerchantOrigins(allowedOrigins, windowRef.location.origin);
  if (!nonce || origins.length === 0) return { send: () => false, dispose: () => {} };
  let acceptedOrigin = null;
  const onMessage = (event) => {
    if (event.source !== parent || !origins.includes(event.origin)) return;
    if (!event.data || event.data.type !== 'ORBIT_CHECKOUT_ACK' || event.data.nonce !== nonce) return;
    acceptedOrigin = event.origin;
    onVerified?.(acceptedOrigin);
  };
  windowRef.addEventListener('message', onMessage);
  origins.forEach((origin) => parent.postMessage({ type: 'ORBIT_CHECKOUT_HELLO', nonce }, origin));
  return {
    send(payload) {
      if (!acceptedOrigin || !validCheckoutEvent(payload)) return false;
      parent.postMessage({ ...payload, nonce }, acceptedOrigin);
      return true;
    },
    get verifiedOrigin() { return acceptedOrigin; },
    dispose() { windowRef.removeEventListener('message', onMessage); acceptedOrigin = null; },
  };
}
