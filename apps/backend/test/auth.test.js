import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import app from '../index.js';
import { generateApiKey, hashApiKey, parseApiKey } from '../apiKeys.js';
import {
  createRateLimiter,
  apiKeyTierLimit,
  apiKeyTierLimitsFromEnv,
  resolveApiKeyTier,
} from '../rateLimit.js';
import { makeApiKey } from './helpers.js';

describe('API key authentication', () => {
  const validMerchantId = '7f8b9a10-b2c3-4d5e-a6f7-112233445566';
  const otherMerchantId = '00000000-0000-4000-8000-000000000000';
  const validStellarAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const keyId = '9c3e1b52-7d4a-4f8e-b1a2-c3d4e5f60718';

  let mockSupabase;
  let apiKey;

  beforeEach(() => {
    apiKey = makeApiKey({ merchantId: validMerchantId, walletAddress: validStellarAddress });
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: apiKey.row, error: null }),
      rpc: vi.fn(),
    };
    app.locals.supabase = mockSupabase;
    app.locals.rateLimiters.ip.reset();
    app.locals.rateLimiters.apiKey.reset();
  });

  describe('key generation', () => {
    it('formats keys as orb_<env>_<32-byte hex> with a short identifying prefix', () => {
      const { secret, prefix, hash } = generateApiKey('live');

      expect(secret).toMatch(/^orb_live_[0-9a-f]{64}$/);
      expect(prefix).toBe(secret.slice(0, 13));
      expect(prefix.length).toBeLessThanOrEqual(16);
      expect(hash).toBe(hashApiKey(secret));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates distinct keys', () => {
      expect(generateApiKey('test').secret).not.toBe(generateApiKey('test').secret);
    });

    it('rejects unknown environments', () => {
      expect(() => generateApiKey('staging')).toThrow();
    });

    it('parses only well-formed keys', () => {
      expect(parseApiKey(`orb_test_${'a'.repeat(64)}`)).toEqual({ environment: 'test', prefix: 'orb_test_aaaa' });
      expect(parseApiKey(`orb_prod_${'a'.repeat(64)}`)).toBeNull();
      expect(parseApiKey(`orb_test_${'a'.repeat(63)}`)).toBeNull();
      expect(parseApiKey(`orb_test_${'A'.repeat(64)}`)).toBeNull();
    });
  });

  describe('middleware', () => {
    const getSubscribers = () => request(app).get('/subscribers');

    it('rejects a request without an Authorization header', async () => {
      const res = await getSubscribers();

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Bearer');
      expect(mockSupabase.maybeSingle).not.toHaveBeenCalled();
    });

    it('rejects a non-Bearer scheme', async () => {
      const res = await getSubscribers().set('Authorization', `Basic ${apiKey.secret}`);
      expect(res.status).toBe(401);
    });

    it('rejects a malformed key without a database lookup', async () => {
      const res = await getSubscribers().set('Authorization', 'Bearer orb_live_not-a-key');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Malformed API key');
      expect(mockSupabase.maybeSingle).not.toHaveBeenCalled();
    });

    it('looks the key up by its SHA-256 hash, never the raw secret', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await getSubscribers().set('Authorization', apiKey.header);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or revoked API key');
      expect(mockSupabase.from).toHaveBeenCalledWith('api_keys');
      expect(mockSupabase.eq).toHaveBeenCalledWith('key_hash', hashApiKey(apiKey.secret));
      expect(JSON.stringify(mockSupabase.eq.mock.calls)).not.toContain(apiKey.secret);
    });

    it('rejects a revoked key', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { ...apiKey.row, revoked_at: new Date().toISOString() },
        error: null,
      });

      const res = await getSubscribers().set('Authorization', apiKey.header);
      expect(res.status).toBe(401);
    });

    it('rejects a key whose stored prefix or environment disagrees with the token', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { ...apiKey.row, environment: 'live' }, error: null });
      expect((await getSubscribers().set('Authorization', apiKey.header)).status).toBe(401);

      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { ...apiKey.row, key_prefix: 'orb_test_0000' }, error: null });
      expect((await getSubscribers().set('Authorization', apiKey.header)).status).toBe(401);
    });

    it('returns 500 without leaking details when the lookup fails', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

      const res = await getSubscribers().set('Authorization', apiKey.header);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to authenticate API key');
    });

    it('records last_used_at when it is stale', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { ...apiKey.row, last_used_at: null }, error: null });
      mockSupabase.eq
        .mockReturnValueOnce(mockSupabase) // key lookup
        .mockResolvedValueOnce({ error: null }) // last_used_at update
        .mockResolvedValueOnce({ data: [], error: null }); // subscribers query

      const res = await getSubscribers().set('Authorization', apiKey.header);

      expect(res.status).toBe(200);
      expect(mockSupabase.update).toHaveBeenCalledWith({ last_used_at: expect.any(String) });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', keyId);
    });

    it('does not rewrite last_used_at on every request', async () => {
      mockSupabase.eq.mockReturnValueOnce(mockSupabase).mockResolvedValueOnce({ data: [], error: null });

      await getSubscribers().set('Authorization', apiKey.header);

      expect(mockSupabase.update).not.toHaveBeenCalled();
    });

    it('protects every merchant route', async () => {
      const routes = [
        request(app).post('/plans').send({}),
        request(app).get('/subscribers'),
        request(app).post('/trigger-pull').send({}),
        request(app).post('/submit-pull').send({}),
        request(app).get('/api-keys'),
        request(app).post('/api-keys').send({}),
        request(app).delete(`/api-keys/${keyId}`),
      ];
      for (const res of await Promise.all(routes)) expect(res.status).toBe(401);
    });

    it('leaves the public checkout routes open', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: keyId, name: 'Pro Plan' }, error: null });

      const res = await request(app).get(`/plans/${keyId}`);

      expect(res.status).toBe(200);
      expect(mockSupabase.maybeSingle).not.toHaveBeenCalled();
    });

    it('sends per-key rate limit headers on authenticated routes', async () => {
      mockSupabase.eq.mockReturnValueOnce(mockSupabase).mockResolvedValueOnce({ data: [], error: null });

      const res = await getSubscribers().set('Authorization', apiKey.header);

      // Free tier quota (#231)
      expect(res.headers['ratelimit-limit']).toBe('60');
      expect(res.headers['ratelimit-remaining']).toBe('59');
      expect(res.headers['ratelimit-reset']).toBe('60');
      expect(res.headers['x-ratelimit-limit']).toBe('60');
      expect(res.headers['x-ratelimit-remaining']).toBe('59');
      expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThan(Date.now() / 1000);
    });

    it('applies the pro tier quota to pro keys', async () => {
      const proKey = makeApiKey({ merchantId: validMerchantId, walletAddress: validStellarAddress, rate_limit_tier: 'pro' });
      mockSupabase.maybeSingle.mockResolvedValue({ data: proKey.row, error: null });
      mockSupabase.eq.mockReturnValueOnce(mockSupabase).mockResolvedValueOnce({ data: [], error: null });

      const res = await getSubscribers().set('Authorization', proKey.header);

      expect(res.headers['x-ratelimit-limit']).toBe('600');
      expect(res.headers['x-ratelimit-remaining']).toBe('599');
    });
  });

  describe('API key management', () => {
    it('creates a key, returning the secret once and storing only its hash', async () => {
      mockSupabase.single.mockImplementationOnce(async () => {
        const [[[inserted]]] = mockSupabase.insert.mock.calls;
        return {
          data: { id: keyId, name: inserted.name, key_prefix: inserted.key_prefix, environment: inserted.environment },
          error: null,
        };
      });

      const res = await request(app)
        .post('/api-keys')
        .set('Authorization', apiKey.header)
        .send({ name: 'CI', environment: 'test' });

      expect(res.status).toBe(201);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.secret).toMatch(/^orb_test_[0-9a-f]{64}$/);

      const [[[inserted]]] = mockSupabase.insert.mock.calls;
      expect(inserted).toEqual({
        merchant_id: validMerchantId,
        name: 'CI',
        key_prefix: res.body.secret.slice(0, 13),
        key_hash: hashApiKey(res.body.secret),
        environment: 'test',
      });
      expect(JSON.stringify(inserted)).not.toContain(res.body.secret);
      expect(res.body.api_key.key_hash).toBeUndefined();
      // The secret must never be persisted through the idempotency store
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('does not let a test key create a live key', async () => {
      const res = await request(app)
        .post('/api-keys')
        .set('Authorization', apiKey.header)
        .send({ name: 'Prod', environment: 'live' });

      expect(res.status).toBe(403);
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });

    it('lets a live key create a live key', async () => {
      const liveKey = makeApiKey({ merchantId: validMerchantId, walletAddress: validStellarAddress, environment: 'live' });
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: liveKey.row, error: null });
      mockSupabase.single.mockResolvedValueOnce({ data: { id: keyId }, error: null });

      const res = await request(app)
        .post('/api-keys')
        .set('Authorization', liveKey.header)
        .send({ name: 'Prod', environment: 'live' });

      expect(res.status).toBe(201);
      expect(res.body.secret).toMatch(/^orb_live_/);
    });

    it('validates the request body', async () => {
      const res = await request(app)
        .post('/api-keys')
        .set('Authorization', apiKey.header)
        .send({ name: 'CI', environment: 'staging' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('environment');
    });

    it("lists only the authenticated merchant's keys without hashes", async () => {
      mockSupabase.order.mockResolvedValueOnce({ data: [{ id: keyId, key_prefix: apiKey.row.key_prefix }], error: null });

      const res = await request(app).get('/api-keys').set('Authorization', apiKey.header);

      expect(res.status).toBe(200);
      expect(res.body.api_keys).toHaveLength(1);
      expect(mockSupabase.eq).toHaveBeenCalledWith('merchant_id', validMerchantId);
      expect(mockSupabase.select).toHaveBeenLastCalledWith(expect.not.stringContaining('key_hash'));
    });

    it("revokes a key scoped to the authenticated merchant", async () => {
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: apiKey.row, error: null })
        .mockResolvedValueOnce({ data: { id: keyId, revoked_at: new Date().toISOString() }, error: null });

      const res = await request(app).delete(`/api-keys/${keyId}`).set('Authorization', apiKey.header);

      expect(res.status).toBe(200);
      expect(mockSupabase.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
      expect(mockSupabase.eq).toHaveBeenCalledWith('merchant_id', validMerchantId);
      expect(mockSupabase.is).toHaveBeenCalledWith('revoked_at', null);
    });

    it("returns 404 when revoking another merchant's or an already revoked key", async () => {
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({ data: apiKey.row, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const res = await request(app).delete(`/api-keys/${otherMerchantId}`).set('Authorization', apiKey.header);

      expect(res.status).toBe(404);
    });
  });
});

describe('API key rate limit tiers (#231)', () => {
  it('defaults to 60 requests for free keys and 600 for pro keys', () => {
    const quota = apiKeyTierLimit();
    expect(quota({ apiKey: { tier: 'free' } })).toBe(60);
    expect(quota({ apiKey: { tier: 'pro' } })).toBe(600);
  });

  it('treats unknown or missing tiers as free', () => {
    expect(resolveApiKeyTier({ apiKey: { tier: 'enterprise' } })).toBe('free');
    expect(resolveApiKeyTier({ apiKey: {} })).toBe('free');
    expect(resolveApiKeyTier({})).toBe('free');
  });

  it('reads tier quotas from the environment, keeping API_KEY_RATE_LIMIT_MAX for free keys', () => {
    expect(apiKeyTierLimitsFromEnv({})).toEqual({ free: 60, pro: 600 });
    expect(apiKeyTierLimitsFromEnv({ API_KEY_RATE_LIMIT_MAX: '100' })).toEqual({ free: 100, pro: 600 });
    expect(apiKeyTierLimitsFromEnv({ API_KEY_FREE_TIER_LIMIT: '30', API_KEY_PRO_TIER_LIMIT: '900', API_KEY_RATE_LIMIT_MAX: '100' }))
      .toEqual({ free: 30, pro: 900 });
  });

  it('rejects a free key with 429 and its tier after 60 requests in the window', async () => {
    let clock = 0;
    const limiter = createRateLimiter({
      windowMs: 60_000,
      limit: apiKeyTierLimit(),
      keyGenerator: (req) => req.apiKey.id,
      now: () => clock,
      describe: (req) => ({ tier: resolveApiKeyTier(req) }),
    });
    limiter.stop();
    const tierApp = express();
    tierApp.use((req, res, next) => { req.apiKey = { id: req.get('X-Key'), tier: req.get('X-Tier') }; next(); });
    tierApp.use(limiter);
    tierApp.get('/', (req, res) => res.json({ ok: true }));
    const call = (key, tier) => request(tierApp).get('/').set('X-Key', key).set('X-Tier', tier);

    for (let i = 0; i < 60; i++) expect((await call('free-key', 'free')).status).toBe(200);
    const blocked = await call('free-key', 'free');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: 'rate_limit_exceeded', limit: 60, tier: 'free', retry_after: 60 });

    // A pro key is still well within its own quota
    expect((await call('pro-key', 'pro')).headers['x-ratelimit-remaining']).toBe('599');

    // Window expiry restores the free key's full quota
    clock += 60_001;
    const reset = await call('free-key', 'free');
    expect(reset.status).toBe(200);
    expect(reset.headers['x-ratelimit-remaining']).toBe('59');
  });
});

describe('Sliding-window rate limiter', () => {
  let clock;
  let limiter;
  let testApp;

  beforeEach(() => {
    clock = 1_000_000;
    limiter = createRateLimiter({
      windowMs: 10_000,
      limit: 3,
      keyGenerator: (req) => req.get('X-Client'),
      now: () => clock,
    });
    limiter.stop();
    testApp = express();
    testApp.use(limiter);
    testApp.get('/', (req, res) => res.json({ ok: true }));
  });

  const hit = (client = 'a') => request(testApp).get('/').set('X-Client', client);

  it('sets standard RateLimit headers and counts down', async () => {
    const first = await hit();
    expect(first.headers['ratelimit-limit']).toBe('3');
    expect(first.headers['ratelimit-remaining']).toBe('2');
    expect(first.headers['ratelimit-reset']).toBe('10');
    expect(first.headers['ratelimit-policy']).toBe('3;w=10');

    expect((await hit()).headers['ratelimit-remaining']).toBe('1');
    expect((await hit()).headers['ratelimit-remaining']).toBe('0');
  });

  it('returns 429 with Retry-After once the limit is reached', async () => {
    await hit(); await hit(); await hit();
    clock += 4_000;

    const res = await hit();

    expect(res.status).toBe(429);
    expect(res.headers['ratelimit-remaining']).toBe('0');
    expect(res.headers['retry-after']).toBe('6');
  });

  it('sets X-RateLimit headers with an absolute reset time', async () => {
    const first = await hit();
    expect(first.headers['x-ratelimit-limit']).toBe('3');
    expect(first.headers['x-ratelimit-remaining']).toBe('2');
    // clock = 1_000_000 ms = 1000 s; the first request leaves the 10 s window at 1010 s
    expect(first.headers['x-ratelimit-reset']).toBe('1010');
  });

  it('returns a structured 429 body with Retry-After seconds', async () => {
    await hit(); await hit(); await hit();
    clock += 4_000;

    const res = await hit();

    expect(res.status).toBe(429);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
    expect(res.body).toEqual({
      error: 'Too many requests, please retry later',
      code: 'rate_limit_exceeded',
      limit: 3,
      remaining: 0,
      retry_after: 6,
      reset_at: new Date(1010 * 1000).toISOString(),
    });
  });

  it('resets the limit once the window expires', async () => {
    await hit(); await hit(); await hit();
    expect((await hit()).status).toBe(429);

    clock += 10_001;
    const res = await hit();
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-remaining']).toBe('2');
  });

  it('frees capacity as individual requests slide out of the window', async () => {
    await hit();
    clock += 5_000;
    await hit(); await hit();
    expect((await hit()).status).toBe(429);

    // Only the first request has left the window
    clock += 5_001;
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(429);
  });

  it('does not let a burst through across a window boundary', async () => {
    clock += 9_000;
    await hit(); await hit(); await hit();
    clock += 2_000; // a fixed window would have reset here
    expect((await hit()).status).toBe(429);
  });

  it('limits each key independently', async () => {
    await hit('a'); await hit('a'); await hit('a');
    expect((await hit('a')).status).toBe(429);
    expect((await hit('b')).status).toBe(200);
  });

  it('does not count rejected requests', async () => {
    await hit(); await hit(); await hit();
    await hit(); await hit();
    clock += 10_001;
    expect((await hit()).headers['ratelimit-remaining']).toBe('2');
  });

  it('sweeps idle keys', async () => {
    await hit('a');
    clock += 10_001;
    limiter.sweep();
    expect((await hit('a')).headers['ratelimit-remaining']).toBe('2');
  });
});
