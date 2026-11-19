-- Webhook dead-letter queue (#229) and API key rate limit tiers (#231).
-- migrate:up

-- Deliveries that still failed after every automatic retry. Kept for merchant
-- inspection and manual replay (POST /webhooks/dead-letters/:id/replay).
CREATE TABLE IF NOT EXISTS webhook_dead_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID REFERENCES webhook_deliveries(id) ON DELETE SET NULL,
    webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    destination_url TEXT,
    attempt_count INTEGER NOT NULL,
    last_response_status INTEGER,
    last_response_body TEXT,
    failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    replayed_at TIMESTAMP WITH TIME ZONE,
    replay_status VARCHAR(20) CHECK (replay_status IN ('success', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS webhook_dead_letters_merchant_failed_idx
    ON webhook_dead_letters (merchant_id, failed_at DESC);
-- Backend-only, like webhook_deliveries: RLS with no policies.
ALTER TABLE webhook_dead_letters ENABLE ROW LEVEL SECURITY;

-- Per-key request quota tier used by the API key rate limiter.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_tier VARCHAR(16) NOT NULL DEFAULT 'free'
    CHECK (rate_limit_tier IN ('free', 'pro'));

-- migrate:down
ALTER TABLE api_keys DROP COLUMN IF EXISTS rate_limit_tier;
DROP TABLE IF EXISTS webhook_dead_letters;
