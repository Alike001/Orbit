import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createObservability,
  registerHealthMetrics,
  recordPullOutcome,
  recordWebhookDelivery,
  setDbPoolSource,
} from '../health-metrics.js';

const db = { from: () => ({ select: () => ({ limit: async () => ({ error: null }), eq: async () => ({ count: 0 }) }) }) };
const healthyRpc = () => ({ getLatestLedger: async () => ({ sequence: 1 }) });

describe('health observability', () => {
  it('reports ready only when Supabase and Soroban RPC are both healthy', async () => {
    const ok = createObservability({ getSupabase: () => db, getSorobanServer: healthyRpc });
    expect((await ok.ready()).ready).toBe(true);
    const down = createObservability({ getSupabase: () => db, getSorobanServer: () => ({ getLatestLedger: async () => { throw new Error('down'); } }) });
    expect((await down.ready()).ready).toBe(false);
  });
});

describe('/metrics endpoint (#230)', () => {
  const metricsApp = (token = 'metrics-secret') => {
    const app = express();
    registerHealthMetrics(app, { getSupabase: () => db, getSorobanServer: healthyRpc, getMetricsToken: () => token });
    return app;
  };
  const scrape = (app) => request(app).get('/metrics').set('Authorization', 'Bearer metrics-secret');
  const sample = (text, name) => {
    const line = text.split('\n').find((l) => l.startsWith(`${name} `));
    return line ? Number(line.slice(name.length + 1)) : 0;
  };

  it('rejects requests without the internal metrics token', async () => {
    const app = metricsApp();
    const missing = await request(app).get('/metrics');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toMatch(/^Bearer/);

    expect((await request(app).get('/metrics').set('Authorization', 'Bearer wrong')).status).toBe(403);
    expect((await request(app).get('/metrics').set('X-Metrics-Token', 'wrong')).status).toBe(403);
    expect((await request(app).get('/metrics').set('X-Metrics-Token', 'metrics-secret')).status).toBe(200);
  });

  it('stays closed when no metrics token is configured', async () => {
    const res = await request(metricsApp('')).get('/metrics').set('Authorization', 'Bearer anything');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/METRICS_TOKEN/);
  });

  it('outputs valid Prometheus text with the pull, webhook and pool metrics', async () => {
    const res = await scrape(metricsApp());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain; version=0\.0\.4/);

    for (const [name, type] of [
      ['orbit_pull_duration_seconds', 'histogram'],
      ['orbit_pull_total', 'counter'],
      ['orbit_webhook_delivery_total', 'counter'],
      ['orbit_db_pool_active', 'gauge'],
    ]) {
      expect(res.text).toContain(`# HELP ${name} `);
      expect(res.text).toContain(`# TYPE ${name} ${type}`);
    }
    // Every sample line is `name{labels} value` in the text exposition format.
    // Prometheus parses NaN/Inf case-insensitively (prom-client emits `Nan`).
    const sampleLine = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? (-?\d+(\.\d+)?(e[+-]?\d+)?|nan|[+-]inf)$/i;
    for (const line of res.text.split('\n').filter((l) => l && !l.startsWith('#'))) {
      expect(line).toMatch(sampleLine);
    }
  });

  it('increments pull counters and histogram buckets by outcome', async () => {
    const app = metricsApp();
    const before = (await scrape(app)).text;

    recordPullOutcome('SUCCESS', 4.2);
    recordPullOutcome('FAILED', 1.5);
    recordPullOutcome('NOT_FOUND', 30);

    const after = (await scrape(app)).text;
    for (const status of ['success', 'failed', 'timeout']) {
      expect(sample(after, `orbit_pull_total{status="${status}"}`)).toBe(sample(before, `orbit_pull_total{status="${status}"}`) + 1);
    }
    // 4.2 s lands in the 5 s bucket but not the 2 s bucket
    const bucket = (text, le) => sample(text, `orbit_pull_duration_seconds_bucket{le="${le}",status="success"}`);
    expect(bucket(after, '5')).toBe(bucket(before, '5') + 1);
    expect(bucket(after, '2')).toBe(bucket(before, '2'));
    expect(sample(after, 'orbit_pull_duration_seconds_count{status="timeout"}'))
      .toBe(sample(before, 'orbit_pull_duration_seconds_count{status="timeout"}') + 1);
  });

  it('counts webhook deliveries and dead-letter transfers', async () => {
    const app = metricsApp();
    const before = (await scrape(app)).text;
    recordWebhookDelivery('success');
    recordWebhookDelivery('failed');
    recordWebhookDelivery('dead_lettered');
    recordWebhookDelivery('not-an-outcome');
    const after = (await scrape(app)).text;
    for (const outcome of ['success', 'failed', 'dead_lettered']) {
      const name = `orbit_webhook_delivery_total{outcome="${outcome}"}`;
      expect(sample(after, name)).toBe(sample(before, name) + 1);
    }
    expect(after).not.toContain('not-an-outcome');
  });

  it('reports active Postgres connections, counting a shared pool once', async () => {
    const primary = { totalCount: 5, idleCount: 2 };
    setDbPoolSource(() => [primary, { totalCount: 3, idleCount: 3 }, primary, null]);
    try {
      expect(sample((await scrape(metricsApp())).text, 'orbit_db_pool_active')).toBe(3);
    } finally {
      setDbPoolSource(null);
    }
  });
});
