import assert from 'node:assert/strict';
import test from 'node:test';
import { checkUsdcReadiness, usdcReadinessMessage } from '../src/usdcReadiness.js';

const asset = { code: 'USDC', issuer: 'GISSUER' };
const options = { horizonUrl: 'https://horizon.example', address: 'GADDRESS', asset, amount: 250000000n };
const mock = (status, balances) => async () => ({ status, ok: status === 200, json: async () => ({ balances }) });
const line = (balance, authorized = true) => ({ asset_code: 'USDC', asset_issuer: 'GISSUER', balance, is_authorized: authorized });

test('validates USDC issuer, trustline and exact 7-decimal shortfall', async () => {
  const missing = await checkUsdcReadiness({ ...options, fetchImpl: mock(200, []) });
  assert.equal(missing.status, 'trustline_missing');
  assert.match(usdcReadinessMessage(missing), /trustline/i);
  const low = await checkUsdcReadiness({ ...options, fetchImpl: mock(200, [line('10.1234567')]) });
  assert.equal(low.status, 'insufficient');
  assert.equal(low.shortfall, '14.8765433');
  assert.match(usdcReadinessMessage(low), /14.8765433/);
  assert.equal((await checkUsdcReadiness({ ...options, fetchImpl: mock(200, [line('25.0000000')]) })).status, 'ready');
  assert.equal((await checkUsdcReadiness({ ...options, fetchImpl: mock(200, [line('25.0000000', false)]) })).status, 'trustline_unauthorized');
  assert.equal((await checkUsdcReadiness({ ...options, fetchImpl: mock(404) })).status, 'account_missing');
});

test('fails closed when Horizon is offline or response is malformed', async () => {
  await assert.rejects(checkUsdcReadiness({ ...options, fetchImpl: mock(500) }), /Unable to verify/);
  await assert.rejects(checkUsdcReadiness({ ...options, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) }), /Unexpected/);
});
