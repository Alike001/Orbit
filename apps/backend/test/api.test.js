import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Merchant API Route Validation & Responses', () => {
  const validMerchantId = '7f8b9a10-b2c3-4d5e-a6f7-112233445566';
  const validPlanId = 'e0b8e99b-5136-4d1d-9351-91a5db4fb056';
  const validSubscriptionId = '4a7f2e18-6c51-41b9-9cf3-90d1bf379b32';
  // Standard valid Stellar Ed25519 public address (G...)
  const validStellarAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  let mockSupabase;

  beforeEach(() => {
    // Create chainable mock Supabase client
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: validPlanId, name: 'Pro Plan', usdc_amount: 29 },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };

    app.locals.supabase = mockSupabase;
  });

  // ==========================================
  // POST /plans
  // ==========================================
  describe('POST /plans', () => {
    it('creates a plan successfully with valid data', async () => {
      const res = await request(app)
        .post('/plans')
        .send({
          merchant_id: validMerchantId,
          name: 'Pro Plan',
          usdc_amount: 29,
          interval_seconds: 2592000,
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Plan created successfully');
      expect(mockSupabase.from).toHaveBeenCalledWith('plans');
    });

    it('rejects missing fields with 400 and explicit field name', async () => {
      const res = await request(app)
        .post('/plans')
        .send({
          name: 'Pro Plan',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant_id');
    });

    it('rejects invalid merchant_id UUID with 400', async () => {
      const res = await request(app)
        .post('/plans')
        .send({
          merchant_id: 'not-a-valid-uuid',
          name: 'Pro Plan',
          usdc_amount: 29,
          interval_seconds: 2592000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant_id');
    });

    it('rejects negative or zero usdc_amount with 400', async () => {
      const res = await request(app)
        .post('/plans')
        .send({
          merchant_id: validMerchantId,
          name: 'Pro Plan',
          usdc_amount: -5,
          interval_seconds: 2592000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('usdc_amount');
    });

    it('rejects non-positive interval_seconds with 400', async () => {
      const res = await request(app)
        .post('/plans')
        .send({
          merchant_id: validMerchantId,
          name: 'Pro Plan',
          usdc_amount: 29,
          interval_seconds: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('interval_seconds');
    });
  });

  // ==========================================
  // GET /plans/:id
  // ==========================================
  describe('GET /plans/:id', () => {
    it('returns plan details for a valid UUID', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validPlanId, name: 'Pro Plan', merchants: { name: 'Acme', wallet_address: validStellarAddress } },
        error: null,
      });

      const res = await request(app).get(`/plans/${validPlanId}`);

      expect(res.status).toBe(200);
      expect(res.body.plan.id).toBe(validPlanId);
      expect(mockSupabase.from).toHaveBeenCalledWith('plans');
    });

    it('returns 400 when plan id is not a valid UUID', async () => {
      const res = await request(app).get('/plans/invalid-id-123');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('id');
    });

    it('returns 404 when plan is not found in database', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const res = await request(app).get(`/plans/${validPlanId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Plan not found');
    });
  });

  // ==========================================
  // GET /subscribers
  // ==========================================
  describe('GET /subscribers', () => {
    it('returns subscribers list for valid merchant_id query param', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        data: [{ id: 'sub-1', customer_wallet_address: validStellarAddress }],
        error: null,
      });

      const res = await request(app).get(`/subscribers?merchant_id=${validMerchantId}`);

      expect(res.status).toBe(200);
      expect(res.body.subscribers).toHaveLength(1);
    });

    it('returns 400 when merchant_id query param is missing', async () => {
      const res = await request(app).get('/subscribers');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant_id');
    });

    it('returns 400 when merchant_id is an invalid UUID', async () => {
      const res = await request(app).get('/subscribers?merchant_id=abc');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant_id');
    });
  });

  // ==========================================
  // POST /subscriptions
  // ==========================================
  describe('POST /subscriptions', () => {
    it('creates a subscription with valid plan_id and Stellar address', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validSubscriptionId, plan_id: validPlanId, customer_wallet_address: validStellarAddress },
        error: null,
      });

      const res = await request(app)
        .post('/subscriptions')
        .send({
          plan_id: validPlanId,
          customer_wallet_address: validStellarAddress,
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Subscription created');
      expect(mockSupabase.from).toHaveBeenCalledWith('subscriptions');
    });

    it('rejects an invalid Stellar public address with 400', async () => {
      const res = await request(app)
        .post('/subscriptions')
        .send({
          plan_id: validPlanId,
          customer_wallet_address: 'invalid-stellar-key-12345',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('customer_wallet_address');
    });

    it('rejects invalid plan_id UUID with 400', async () => {
      const res = await request(app)
        .post('/subscriptions')
        .send({
          plan_id: 'not-a-uuid',
          customer_wallet_address: validStellarAddress,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('plan_id');
    });
  });

  // ==========================================
  // POST /trigger-pull
  // ==========================================
  describe('POST /trigger-pull', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/trigger-pull')
        .send({
          subscription_id: validSubscriptionId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('merchant_secret');
    });

    it('returns 400 when subscription_id is not a UUID', async () => {
      const res = await request(app)
        .post('/trigger-pull')
        .send({
          subscription_id: 'not-a-uuid',
          merchant_secret: 'some-secret',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('subscription_id');
    });
  });
});
