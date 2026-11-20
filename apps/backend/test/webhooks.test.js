import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';
import request from 'supertest';
import app from '../index.js';
import {
  generateSigningSecret,
  computeWebhookSignature,
  verifyWebhookSignature,
  createWebhookSchema,
  backfillWebhookSchema,
  dispatchWebhookEvent,
  replayWebhookEvents,
  signWebhookPayload,
  parseSignatureHeader,
  verifyTimestampedSignature,
  webhookRetryDelayMs,
  replayDeadLetter,
  WEBHOOK_MAX_ATTEMPTS,
} from '../webhooks.js';
import { createFakeSupabase } from './fakeSupabase.js';

describe('Webhook System', () => {
  const validMerchantId = '7f8b9a10-b2c3-4d5e-a6f7-112233445566';
  const secret = 'whsec_test_secret_1234567890';
  const otherMerchant = '00000000-0000-4000-8000-000000000000';

  describe('Signing & Validation', () => {
    it('generates a secret prefixed with whsec_', () => {
      const s = generateSigningSecret();
      expect(s.startsWith('whsec_')).toBe(true);
      expect(s.length).toBeGreaterThan(20);
    });

    it('computes HMAC-SHA256 signature in sha256=... format', () => {
      const payloadString = JSON.stringify({ event: 'subscription.created', id: '123' });
      const sig = computeWebhookSignature(secret, payloadString);
      expect(sig.startsWith('sha256=')).toBe(true);
    });

    it('validates endpoint url and subscribed events', () => {
      const valid = {
        merchant_id: validMerchantId,
        url: 'https://api.example.com/webhooks',
        subscribed_events: ['subscription.created', 'payment.settled'],
      };
      const result = createWebhookSchema.safeParse(valid);
      expect(result.success).toBe(true);

      const invalidUrl = {
        merchant_id: validMerchantId,
        url: 'not-a-valid-url',
      };
      expect(createWebhookSchema.safeParse(invalidUrl).success).toBe(false);
    });
  });

  describe('dispatchWebhookEvent', () => {
    it('dispatches to active webhooks matching the event', async () => {
      const mockWebhook = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        merchant_id: validMerchantId,
        url: 'https://example.com/webhook',
        signing_secret: secret,
        subscribed_events: ['*'],
        active: true,
      };

      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'webhooks') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [mockWebhook], error: null }),
                }),
              }),
            };
          }
          if (table === 'webhook_deliveries') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'delivery-uuid-1',
                      webhook_id: mockWebhook.id,
                      response_status: 200,
                      status: 'success',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: vi.fn().mockResolvedValue('OK'),
      });

      const results = await dispatchWebhookEvent(mockSupabase, {
        merchantId: validMerchantId,
        eventType: 'payment.settled',
        payload: { txHash: '0xabc123', amount: 50 },
        fetchImpl: mockFetch,
      });

      expect(results).toHaveLength(1);
      expect(results[0].response_status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        mockWebhook.url,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Orbit-Signature': expect.stringMatching(/^t=\d+,v1=[a-f0-9]{64}$/),
          }),
        })
      );
    });
  });

  describe('Historical Webhook Replay & Backfill Engine (#170)', () => {
    const webhookId = '11111111-2222-3333-4444-555555555555';
    const mockWebhook = {
      id: webhookId,
      merchant_id: validMerchantId,
      url: 'https://merchant.example.com/webhooks',
      signing_secret: secret,
      events: ['payment.settled', 'subscription.created'],
      active: true,
    };

    const historicalEvents = [
      {
        id: 'ev-1',
        merchant_id: validMerchantId,
        event_type: 'payment.settled',
        payload: { txHash: '0x1', amount: 100, timestamp: '2026-10-10T10:00:00Z' },
        created_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'ev-2',
        merchant_id: validMerchantId,
        event_type: 'subscription.created',
        payload: { customer: 'GA123', plan: 'pro', timestamp: '2026-10-12T10:00:00Z' },
        created_at: '2026-10-12T10:00:00Z',
      },
      {
        id: 'ev-3',
        merchant_id: validMerchantId,
        event_type: 'payment.settled',
        payload: { txHash: '0x2', amount: 200, timestamp: '2026-10-15T10:00:00Z' },
        created_at: '2026-10-15T10:00:00Z',
      },
    ];

    it('attaches X-Orbit-Replay: true header, valid HMAC signature, and preserves timestamps in metadata', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'webhooks') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockWebhook, error: null }),
                }),
              }),
            };
          }
          if (table === 'webhook_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [historicalEvents[0]], error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'webhook_deliveries') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'del-1', status: 'success', response_status: 200 },
                    error: null,
                  }),
                }),
              }),
            };
          }
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: vi.fn().mockResolvedValue('OK'),
      });

      const result = await replayWebhookEvents(mockSupabase, {
        webhookId,
        eventTypes: ['payment.settled'],
        fetchImpl: mockFetch,
        rateLimitPerSecond: 10,
      });

      expect(result.replayed_count).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [callUrl, callOptions] = mockFetch.mock.calls[0];
      expect(callUrl).toBe(mockWebhook.url);
      expect(callOptions.headers['X-Orbit-Replay']).toBe('true');
      expect(callOptions.headers['X-Orbit-Event']).toBe('payment.settled');
      expect(callOptions.headers['X-Orbit-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

      // Verify HMAC signature validity
      const payloadString = callOptions.body;
      const parsedBody = JSON.parse(payloadString);
      expect(verifyTimestampedSignature(callOptions.headers['X-Orbit-Signature'], payloadString, [secret])).toBe(true);

      // Verify original timestamp preserved in payload metadata
      expect(parsedBody.metadata.original_timestamp).toBe('2026-10-10T10:00:00Z');
      expect(parsedBody.metadata.replayed).toBe(true);
      expect(parsedBody.metadata.replayed_at).toBeDefined();
    });

    it('throttles replay delivery to 10 events/second using the rate throttling queue', async () => {
      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'webhooks') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: mockWebhook, error: null }),
                }),
              }),
            };
          }
          if (table === 'webhook_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: historicalEvents, error: null }),
                }),
              }),
            };
          }
          if (table === 'webhook_deliveries') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'del', status: 'success' },
                    error: null,
                  }),
                }),
              }),
            };
          }
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: vi.fn().mockResolvedValue('OK'),
      });

      const mockSleep = vi.fn().mockResolvedValue();

      const result = await replayWebhookEvents(mockSupabase, {
        webhookId,
        eventTypes: ['*'],
        fetchImpl: mockFetch,
        sleepImpl: mockSleep,
        rateLimitPerSecond: 10, // 10 events/sec -> 100ms interval
      });

      expect(result.replayed_count).toBe(3);
      // For 3 events, delay should be called twice (before 2nd and 3rd event)
      expect(mockSleep).toHaveBeenCalledTimes(2);
      expect(mockSleep).toHaveBeenCalledWith(100);
    });

    it('POST /webhooks/:id/backfill invokes replay with query parameters', async () => {
      const testWebhook = {
        id: '22222222-2222-2222-2222-222222222222',
        merchant_id: validMerchantId,
        url: 'https://client.example.com/webhook',
        signing_secret: secret,
        events: ['payment.settled'],
        active: true,
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn(),
        single: vi.fn(),
      };

      mockSupabase.single.mockImplementation(() => {
        const lastFromCall = mockSupabase.from.mock.calls[mockSupabase.from.mock.calls.length - 1]?.[0];
        if (lastFromCall === 'webhooks') {
          return Promise.resolve({ data: testWebhook, error: null });
        }
        return Promise.resolve({ data: { id: 'del-backfill', status: 'success' }, error: null });
      });

      mockSupabase.order.mockResolvedValue({
        data: [historicalEvents[0]],
        error: null,
      });

      app.locals.supabase = mockSupabase;
      app.locals.fetchImpl = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: vi.fn().mockResolvedValue('{"received":true}'),
      });

      const res = await request(app)
        .post(`/webhooks/${testWebhook.id}/backfill`)
        .send({
          event_types: ['payment.settled'],
          start_date: '2026-10-01',
          end_date: '2026-10-18',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('backfill completed');
      expect(res.body.replayed_count).toBe(1);
    }, 15000);
  });

  describe('Timestamped HMAC-SHA256 signatures (#229)', () => {
    const body = JSON.stringify({ event: 'payment.settled', amount: 50 });
    const at = 1_800_000_000;
    const now = () => at * 1000;

    it('signs "<t>.<body>" and sends it as t=<timestamp>,v1=<hash>', () => {
      const { header, timestamp, v1 } = signWebhookPayload(secret, body, at);
      expect(timestamp).toBe(at);
      expect(header).toBe(`t=${at},v1=${v1}`);
      const expected = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
      expect(v1).toBe(expected);
      expect(parseSignatureHeader(header)).toEqual({ timestamp: at, signatures: [expected] });
    });

    it('verifies a fresh signature and rejects tampering, wrong secrets and malformed headers', () => {
      const { header } = signWebhookPayload(secret, body, at);
      expect(verifyTimestampedSignature(header, body, [secret], { now })).toBe(true);
      expect(verifyTimestampedSignature(header, body.replace('50', '51'), [secret], { now })).toBe(false);
      expect(verifyTimestampedSignature(header, body, ['whsec_other_secret_value'], { now })).toBe(false);
      // The timestamp is part of the signed string, so it cannot be swapped
      const forged = header.replace(`t=${at}`, `t=${at + 1}`);
      expect(verifyTimestampedSignature(forged, body, [secret], { now })).toBe(false);
      for (const bad of ['', 'sha256=abc', `t=${at}`, `v1=${'a'.repeat(64)}`, 't=x,v1=zz']) {
        expect(verifyTimestampedSignature(bad, body, [secret], { now })).toBe(false);
      }
    });

    it('rejects replays outside the 5-minute tolerance window', () => {
      const { header } = signWebhookPayload(secret, body, at);
      expect(verifyTimestampedSignature(header, body, [secret], { now: () => (at + 300) * 1000 })).toBe(true);
      expect(verifyTimestampedSignature(header, body, [secret], { now: () => (at + 301) * 1000 })).toBe(false);
      expect(verifyTimestampedSignature(header, body, [secret], { now: () => (at - 301) * 1000 })).toBe(false);
    });

    it('accepts the previous secret during rotation', () => {
      const { header } = signWebhookPayload('whsec_previous_secret_1', body, at);
      expect(verifyTimestampedSignature(header, body, [secret, 'whsec_previous_secret_1'], { now })).toBe(true);
    });
  });

  describe('Retries with jittered backoff and dead-letter queue (#229)', () => {
    const webhook = {
      id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      merchant_id: validMerchantId,
      url: 'https://merchant.example.com/hooks',
      signing_secret: secret,
      events: ['*'],
      active: true,
    };
    const response = (status) => ({ ok: status >= 200 && status < 300, status, text: async () => `status ${status}` });

    // Captures scheduled retries instead of waiting on real timers
    const manualScheduler = () => {
      const pending = [];
      return {
        pending,
        schedule: (fn, delayMs) => pending.push({ fn, delayMs }),
        runNext: async () => {
          const next = pending.shift();
          await next.fn();
          return next.delayMs;
        },
      };
    };

    const dispatch = (supabase, fetchImpl, scheduler) => dispatchWebhookEvent(supabase, {
      merchantId: validMerchantId,
      eventType: 'payment.settled',
      payload: { txHash: '0xabc', amount: 50 },
      fetchImpl,
      retry: { schedule: scheduler.schedule, baseDelayMs: 1000, maxDelayMs: 60_000, random: () => 0.5 },
    });

    it('uses exponential backoff with equal jitter, capped at the maximum delay', () => {
      const opts = { baseDelayMs: 1000, maxDelayMs: 10_000 };
      expect(webhookRetryDelayMs(1, { ...opts, random: () => 0 })).toBe(500);
      expect(webhookRetryDelayMs(1, { ...opts, random: () => 1 })).toBe(1000);
      expect(webhookRetryDelayMs(3, { ...opts, random: () => 0 })).toBe(2000);
      expect(webhookRetryDelayMs(3, { ...opts, random: () => 1 })).toBe(4000);
      expect(webhookRetryDelayMs(10, { ...opts, random: () => 1 })).toBe(10_000);
    });

    it('returns after the first attempt and retries a transient failure later without blocking', async () => {
      const supabase = createFakeSupabase({ webhooks: [webhook] });
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(response(503))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(response(200));
      const scheduler = manualScheduler();

      const [delivery] = await dispatch(supabase, fetchImpl, scheduler);

      // Only the first attempt ran inline; the retry is queued, not awaited
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(delivery).toMatchObject({ status: 'retrying', attempt_count: 1, response_status: 503 });
      expect(delivery.next_retry_at).toEqual(expect.any(String));
      expect(scheduler.pending).toHaveLength(1);

      // Attempt 2 after ~1s (base 1000, jitter 0.5 -> 750ms), fails with a network error
      expect(await scheduler.runNext()).toBe(750);
      expect(supabase.tables.webhook_deliveries[0]).toMatchObject({ status: 'retrying', attempt_count: 2, response_status: 500 });

      // Attempt 3 after ~2s succeeds; nothing further is scheduled
      expect(await scheduler.runNext()).toBe(1500);
      expect(supabase.tables.webhook_deliveries[0]).toMatchObject({ status: 'success', attempt_count: 3, response_status: 200, next_retry_at: null });
      expect(scheduler.pending).toHaveLength(0);
      expect(supabase.tables.webhook_dead_letters ?? []).toHaveLength(0);

      // Every attempt carries a fresh, verifiable signature and its attempt number
      const attempts = fetchImpl.mock.calls.map(([, init]) => init);
      expect(attempts.map((init) => init.headers['X-Orbit-Attempt'])).toEqual(['1', '2', '3']);
      for (const init of attempts) {
        expect(verifyTimestampedSignature(init.headers['X-Orbit-Signature'], init.body, [secret])).toBe(true);
      }
    });

    it(`archives a delivery in the dead-letter queue after ${WEBHOOK_MAX_ATTEMPTS} failed attempts`, async () => {
      const supabase = createFakeSupabase({ webhooks: [webhook] });
      const fetchImpl = vi.fn().mockResolvedValue(response(500));
      const scheduler = manualScheduler();

      await dispatch(supabase, fetchImpl, scheduler);
      const delays = [];
      while (scheduler.pending.length) delays.push(await scheduler.runNext());

      expect(fetchImpl).toHaveBeenCalledTimes(WEBHOOK_MAX_ATTEMPTS);
      // Exponential: 1s, 2s, 4s, 8s base delays at jitter 0.5
      expect(delays).toEqual([750, 1500, 3000, 6000]);
      expect(supabase.tables.webhook_deliveries[0]).toMatchObject({ status: 'dead_lettered', attempt_count: 5, next_retry_at: null });
      expect(supabase.tables.webhook_dead_letters).toHaveLength(1);
      expect(supabase.tables.webhook_dead_letters[0]).toMatchObject({
        delivery_id: supabase.tables.webhook_deliveries[0].id,
        webhook_id: webhook.id,
        merchant_id: validMerchantId,
        event_type: 'payment.settled',
        payload: { txHash: '0xabc', amount: 50 },
        destination_url: webhook.url,
        attempt_count: 5,
        last_response_status: 500,
      });
    });

    it('does not retry successful deliveries', async () => {
      const supabase = createFakeSupabase({ webhooks: [webhook] });
      const scheduler = manualScheduler();
      const [delivery] = await dispatch(supabase, vi.fn().mockResolvedValue(response(204)), scheduler);
      expect(delivery).toMatchObject({ status: 'success', next_retry_at: null });
      expect(scheduler.pending).toHaveLength(0);
    });

    it('replays a dead letter manually with a fresh signature and records the outcome', async () => {
      const deadLetterId = 'dddddddd-0000-4000-8000-000000000001';
      const supabase = createFakeSupabase({
        webhook_dead_letters: [{
          id: deadLetterId,
          delivery_id: 'eeeeeeee-0000-4000-8000-000000000001',
          webhook_id: webhook.id,
          merchant_id: validMerchantId,
          event_type: 'payment.settled',
          payload: { txHash: '0xabc' },
          destination_url: webhook.url,
          attempt_count: 5,
          webhooks: webhook,
        }],
      });
      const fetchImpl = vi.fn().mockResolvedValue(response(200));

      expect(await replayDeadLetter(supabase, deadLetterId, { merchantId: otherMerchant, fetchImpl })).toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();

      const replayed = await replayDeadLetter(supabase, deadLetterId, { merchantId: validMerchantId, fetchImpl });

      expect(replayed).toMatchObject({ replay_status: 'success', last_response_status: 200, replayed_at: expect.any(String) });
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe(webhook.url);
      expect(init.headers['X-Orbit-Replay']).toBe('true');
      expect(verifyTimestampedSignature(init.headers['X-Orbit-Signature'], init.body, [secret])).toBe(true);
    });
  });

  describe('Dead-letter routes (#229)', () => {
    const deadLetter = {
      id: 'dddddddd-0000-4000-8000-000000000002',
      merchant_id: validMerchantId,
      webhook_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      event_type: 'payment.settled',
      payload: { txHash: '0xabc' },
      destination_url: 'https://merchant.example.com/hooks',
      attempt_count: 5,
      failed_at: '2026-11-19T10:00:00Z',
      webhooks: { id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', url: 'https://merchant.example.com/hooks', signing_secret: secret },
    };

    it('lists a merchant\'s dead letters', async () => {
      const range = vi.fn().mockResolvedValue({ data: [deadLetter], count: 1, error: null });
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range };
      app.locals.supabase = { from: vi.fn(() => query) };

      expect((await request(app).get('/webhooks/dead-letters')).status).toBe(400);
      const res = await request(app).get('/webhooks/dead-letters').query({ merchant_id: validMerchantId });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 1, dead_letters: [{ id: deadLetter.id, attempt_count: 5 }] });
      expect(app.locals.supabase.from).toHaveBeenCalledWith('webhook_dead_letters');
      expect(query.eq).toHaveBeenCalledWith('merchant_id', validMerchantId);
    });

    it('replays a dead letter for its merchant and 404s for anyone else', async () => {
      app.locals.supabase = createFakeSupabase({ webhook_dead_letters: [{ ...deadLetter }] });
      app.locals.fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
      try {
        const denied = await request(app).post(`/webhooks/dead-letters/${deadLetter.id}/replay`).send({ merchant_id: otherMerchant });
        expect(denied.status).toBe(404);

        const res = await request(app).post(`/webhooks/dead-letters/${deadLetter.id}/replay`).send({ merchant_id: validMerchantId });
        expect(res.status).toBe(200);
        expect(res.body.dead_letter).toMatchObject({ replay_status: 'success', last_response_status: 200 });
        expect(app.locals.fetchImpl).toHaveBeenCalledTimes(1);
      } finally {
        delete app.locals.fetchImpl;
      }
    });
  });
});
