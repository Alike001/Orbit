/**
 * Pending checkout session persistence in sessionStorage (#265).
 *
 * Saves the minimum state needed to resume polling after a page reload:
 *   - planId, merchantAddress, txHash, stage, savedAt
 *
 * Sessions expire after SESSION_EXPIRY_MS (10 minutes) and are cleaned up
 * automatically on read and on final settlement.
 */

export const SESSION_KEY = 'orbit:pending-session';
export const SESSION_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes (#265)

/**
 * Persist a pending checkout session.
 * @param {{ planId: string, merchantAddress: string, hash: string, stage: string }} data
 */
export function savePendingSession(data) {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...data, savedAt: Date.now() }),
    );
  } catch {
    // sessionStorage unavailable (private mode, storage full) — degrade silently.
  }
}

/**
 * Load a pending session if one exists and has not expired.
 * Returns null and removes the entry if the session is stale (#265).
 * @returns {{ planId, merchantAddress, hash, stage, savedAt } | null}
 */
export function loadPendingSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.hash || !data?.savedAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (Date.now() - data.savedAt > SESSION_EXPIRY_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null; // expired (#265)
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Clear the pending session (call on success, final failure, or expiry).
 */
export function clearPendingSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
