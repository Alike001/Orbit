import assert from 'node:assert/strict';
import test from 'node:test';
import { CHECKOUT_EVENTS, createCheckoutMessageBridge, normalizeMerchantOrigins, validCheckoutEvent } from '../src/checkoutMessageBridge.js';

function setup() {
  const sent = [];
  const listeners = new Map();
  const parent = { postMessage: (data, origin) => sent.push({ data, origin }) };
  const windowRef = {
    parent, location: { origin: 'https://checkout.orbit.test' },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type, callback) => { if (listeners.get(type) === callback) listeners.delete(type); },
  };
  return { sent, listeners, parent, windowRef, deliver: (event) => listeners.get('message')?.(event) };
}

test('rejects untrusted origins and requires exact parent plus handshake nonce', () => {
  const env = setup();
  const bridge = createCheckoutMessageBridge({ windowRef: env.windowRef, allowedOrigins: ['https://merchant.test'], nonce: 'a-random-nonce' });
  assert.deepEqual(env.sent[0], { data: { type: 'ORBIT_CHECKOUT_HELLO', nonce: 'a-random-nonce' }, origin: 'https://merchant.test' });
  const success = { type: CHECKOUT_EVENTS.success, vaultId: 'vault123', transactionHash: 'tx123', timestamp: new Date().toISOString() };
  assert.equal(bridge.send(success), false);
  env.deliver({ source: {}, origin: 'https://merchant.test', data: { type: 'ORBIT_CHECKOUT_ACK', nonce: 'a-random-nonce' } });
  env.deliver({ source: env.parent, origin: 'https://evil.test', data: { type: 'ORBIT_CHECKOUT_ACK', nonce: 'a-random-nonce' } });
  env.deliver({ source: env.parent, origin: 'https://merchant.test', data: { type: 'ORBIT_CHECKOUT_ACK', nonce: 'wrong' } });
  assert.equal(bridge.send(success), false);
  env.deliver({ source: env.parent, origin: 'https://merchant.test', data: { type: 'ORBIT_CHECKOUT_ACK', nonce: 'a-random-nonce' } });
  assert.equal(bridge.send(success), true);
  assert.equal(env.sent.at(-1).origin, 'https://merchant.test');
  assert.equal(env.sent.at(-1).data.transactionHash, 'tx123');
  bridge.dispose();
  assert.equal(env.listeners.size, 0);
  assert.equal(bridge.send(success), false);
});

test('validates payload schemas and disallows wildcard origins', () => {
  assert.deepEqual(normalizeMerchantOrigins(['*', 'https://good.test', 'https://good.test', 'https://bad.test/path'], 'https://checkout.test'), ['https://good.test']);
  assert.equal(validCheckoutEvent({ type: CHECKOUT_EVENTS.success, vaultId: 'v' }), false);
  assert.equal(validCheckoutEvent({ type: CHECKOUT_EVENTS.failed, code: 'TX_FAILED', message: 'failure' }), true);
  assert.equal(validCheckoutEvent({ type: CHECKOUT_EVENTS.closed }), true);
  assert.equal(validCheckoutEvent({ type: 'ORBIT_CHECKOUT_SUCCESS', vaultId: 'v', transactionHash: 'tx', timestamp: 'nope' }), false);
});
