const crypto = require('crypto');
const client = require('prom-client');

// Business metrics recorded by the pull and webhook code paths (#230). They live in
// one process-wide registry so any module can record into it; /metrics merges it with
// the per-app transport registry.
const businessRegistry = new client.Registry();

const pullDuration = new client.Histogram({
    name: 'orbit_pull_duration_seconds',
    help: 'Time spent waiting for Soroban confirmation of a pull transaction',
    labelNames: ['status'],
    buckets: [0.5, 1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120],
    registers: [businessRegistry],
});
const pullTotal = new client.Counter({
    name: 'orbit_pull_total',
    help: 'Pull transactions by confirmation outcome',
    labelNames: ['status'],
    registers: [businessRegistry],
});
const webhookDeliveryTotal = new client.Counter({
    name: 'orbit_webhook_delivery_total',
    help: 'Webhook delivery attempts by outcome; dead_lettered counts transfers to the DLQ',
    labelNames: ['outcome'],
    registers: [businessRegistry],
});

// Returns the pg pools to report on; index.js points this at the database manager
let dbPoolSource = () => [];
const setDbPoolSource = (source) => { dbPoolSource = typeof source === 'function' ? source : () => []; };
new client.Gauge({
    name: 'orbit_db_pool_active',
    help: 'Checked-out (active) Postgres connections across the backend pg pools',
    registers: [businessRegistry],
    collect() {
        let active = 0;
        try {
            // The report pool may be the primary pool itself, so count each pool once
            for (const pool of new Set(dbPoolSource() || [])) {
                if (pool) active += Math.max(0, (pool.totalCount || 0) - (pool.idleCount || 0));
            }
        } catch { /* a failing pool lookup must not break the scrape */ }
        this.set(active);
    },
});

const PULL_STATUSES = { SUCCESS: 'success', FAILED: 'failed' };

// Records one pull outcome: SUCCESS -> success, FAILED -> failed, anything else
// (still NOT_FOUND when polling gave up) -> timeout
const recordPullOutcome = (confirmationStatus, durationSeconds) => {
    const status = PULL_STATUSES[confirmationStatus] || 'timeout';
    pullTotal.inc({ status });
    if (Number.isFinite(durationSeconds) && durationSeconds >= 0) pullDuration.observe({ status }, durationSeconds);
};

const WEBHOOK_OUTCOMES = new Set(['success', 'failed', 'dead_lettered']);
const recordWebhookDelivery = (outcome) => {
    if (WEBHOOK_OUTCOMES.has(outcome)) webhookDeliveryTotal.inc({ outcome });
};

// /metrics is internal: it requires METRICS_TOKEN as a bearer token (or X-Metrics-Token).
// Without a configured token the endpoint is closed rather than public.
const metricsAuth = (getToken = () => process.env.METRICS_TOKEN) => (req, res, next) => {
    const token = getToken();
    if (!token) return res.status(403).json({ error: 'Metrics endpoint disabled: METRICS_TOKEN is not configured' });
    const match = /^Bearer\s+(\S+)\s*$/i.exec(req.get('Authorization') ?? '');
    const supplied = match ? match[1] : req.get('X-Metrics-Token');
    if (!supplied) {
        res.set('WWW-Authenticate', 'Bearer realm="orbit-metrics"');
        return res.status(401).json({ error: 'Missing metrics token' });
    }
    const a = crypto.createHash('sha256').update(String(supplied)).digest();
    const b = crypto.createHash('sha256').update(String(token)).digest();
    if (!crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'Invalid metrics token' });
    next();
};

function createObservability({ getSupabase, getSorobanServer, rpcUrl, registry = new client.Registry() }) {
    client.collectDefaultMetrics({ register: registry, prefix: 'orbit_' });
    const httpLatency = new client.Histogram({ name: 'orbit_http_request_duration_seconds', help: 'HTTP request latency', labelNames: ['method', 'route', 'status'], registers: [registry] });
    const rpcLatency = new client.Histogram({ name: 'orbit_soroban_rpc_duration_seconds', help: 'Soroban RPC latency', labelNames: ['method', 'status'], registers: [registry] });
    const subscriptions = new client.Gauge({ name: 'orbit_subscriptions', help: 'Subscriptions by state', labelNames: ['state'], registers: [registry] });
    const failedPulls = new client.Gauge({ name: 'orbit_failed_pulls', help: 'Past-due subscriptions', registers: [registry] });
    async function ready() {
        const checks = {};
        try { const { error } = await getSupabase().from('merchants').select('id').limit(1); if (error) throw error; checks.supabase = 'ok'; } catch (e) { checks.supabase = e.message; }
        try { const started = process.hrtime.bigint(); await getSorobanServer(rpcUrl).getLatestLedger(); rpcLatency.observe({ method: 'getLatestLedger', status: 'ok' }, Number(process.hrtime.bigint() - started) / 1e9); checks.soroban_rpc = 'ok'; } catch (e) { rpcLatency.observe({ method: 'getLatestLedger', status: 'error' }, 0); checks.soroban_rpc = e.message; }
        return { ready: checks.supabase === 'ok' && checks.soroban_rpc === 'ok', checks };
    }
    async function collectBusinessMetrics() {
        try { const { count: active } = await getSupabase().from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'); subscriptions.set({ state: 'active' }, active || 0); const { count: failed } = await getSupabase().from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'past_due'); failedPulls.set(failed || 0); } catch { /* scrape still exposes transport metrics */ }
    }
    return { registry, ready, collectBusinessMetrics, httpLatency };
}

function registerHealthMetrics(app, options) {
    const obs = createObservability(options); app.locals.healthMetricsRegistered = true;
    app.use((req, res, next) => { const started = process.hrtime.bigint(); res.on('finish', () => obs.httpLatency.observe({ method: req.method, route: req.route?.path || req.path, status: String(res.statusCode) }, Number(process.hrtime.bigint() - started) / 1e9)); next(); });
    app.get('/health/live', (req, res) => res.json({ live: true }));
    app.get('/health/ready', async (req, res) => {
        const indexer = app.locals.ledgerIndexer;
        if (!indexer) return res.status(503).json({ ready: false, checks: { ledger_indexer: 'missing' } });
        try {
            const status = await indexer.health();
            return res.status(status.ready ? 200 : 503).json(status);
        } catch (e) {
            return res.status(503).json({ ready: false, checks: { ledger_indexer: e.message } });
        }
    });
    const metricsRegistry = client.Registry.merge([obs.registry, businessRegistry]);
    app.get('/metrics', metricsAuth(options.getMetricsToken), async (req, res) => { await obs.collectBusinessMetrics(); res.set('Content-Type', metricsRegistry.contentType); res.send(await metricsRegistry.metrics()); });
    return obs;
}
module.exports = {
    createObservability,
    registerHealthMetrics,
    businessRegistry,
    metricsAuth,
    recordPullOutcome,
    recordWebhookDelivery,
    setDbPoolSource,
};
