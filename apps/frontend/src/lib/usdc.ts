/** USDC on Stellar uses 7 decimals, so 290000000 raw units = 29 USDC. */
export const USDC_DECIMALS = 7;

/**
 * Converts a raw token amount (as stored in `plans.usdc_amount` and passed to
 * the contract's `amount_per_interval`) to a display amount in whole USDC.
 */
export function fromRawUsdc(raw: number | string | null | undefined): number {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value)) return 0;
  return value / 10 ** USDC_DECIMALS;
}
