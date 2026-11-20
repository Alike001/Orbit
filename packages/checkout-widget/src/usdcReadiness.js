const STROOPS = 10_000_000n;
const toStroops = (value) => {
  if (!/^\d+(?:\.\d{1,7})?$/.test(String(value))) throw new Error('Invalid USDC balance response.');
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * STROOPS + BigInt((fraction + '0000000').slice(0, 7));
};
const fromStroops = (value) => {
  const amount = BigInt(value);
  return `${amount / STROOPS}.${(amount % STROOPS).toString().padStart(7, '0')}`;
};

/**
 * Read the actual USDC trustline, including a zero balance (the pay-with
 * picker intentionally hides zero balances, so it cannot answer this).
 */
export async function checkUsdcReadiness({
  horizonUrl, address, asset, amount, fetchImpl = globalThis.fetch,
}) {
  if (!asset?.issuer || asset.code !== 'USDC') throw new Error('USDC issuer is not configured for this network.');
  const response = await fetchImpl(`${horizonUrl}/accounts/${encodeURIComponent(address)}`);
  if (response.status === 404) {
    return { status: 'account_missing', balance: '0.0000000', shortfall: fromStroops(amount) };
  }
  if (!response.ok) throw new Error('Unable to verify the USDC balance with Stellar Horizon. Please retry.');
  const account = await response.json();
  if (!Array.isArray(account?.balances)) throw new Error('Unexpected Horizon balance response.');
  const trustline = account.balances.find((line) =>
    line.asset_code === asset.code && line.asset_issuer === asset.issuer);
  if (!trustline) return { status: 'trustline_missing', balance: '0.0000000', shortfall: fromStroops(amount) };
  if (trustline.is_authorized === false || trustline.is_authorized_to_maintain_liabilities === true) {
    return { status: 'trustline_unauthorized', balance: trustline.balance, shortfall: fromStroops(amount) };
  }
  const current = toStroops(trustline.balance);
  const required = BigInt(amount);
  if (current < required) {
    return { status: 'insufficient', balance: trustline.balance, shortfall: fromStroops(required - current) };
  }
  return { status: 'ready', balance: trustline.balance, shortfall: '0.0000000' };
}

export function usdcReadinessMessage(result) {
  if (!result) return 'Checking your USDC balance…';
  if (result.status === 'ready') return '';
  if (result.status === 'account_missing') return 'Stellar account not funded yet. Fund your wallet with XLM and USDC before subscribing.';
  if (result.status === 'trustline_missing') return 'USDC trustline missing. Establish the USDC trustline in your wallet before subscribing.';
  if (result.status === 'trustline_unauthorized') return 'USDC trustline is not authorized. Contact the asset issuer before subscribing.';
  if (result.status === 'insufficient') return `Insufficient USDC: add ${result.shortfall} USDC to subscribe.`;
  return 'Unable to verify USDC readiness.';
}
