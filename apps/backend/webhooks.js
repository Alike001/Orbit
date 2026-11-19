const crypto = require("crypto");
const { z } = require("zod");
const {
  validateWebhookURL,
  dispatchSecureWebhook,
} = require("./webhook-security");
const { recordWebhookDelivery } = require("./health-metrics");

const createWebhookSchema = z.object({
  merchant_id: z.string().uuid("merchant_id must be a valid UUID"),
  url: z.string().url("url must be a valid URL"),
  events: z
    .array(z.string())
    .min(1, "at least one event must be selected")
    .default(["*"]),
  signing_secret: z.string().min(16).optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url("url must be a valid URL").optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
  signing_secret: z.string().min(16).optional(),
});

const generateSigningSecret = () => {
  return `whsec_${crypto.randomBytes(16).toString("hex")}`;
};

const computeWebhookSignature = (secret, payloadString) => {
  return `sha256=${crypto.createHmac("sha256", secret).update(payloadString).digest("hex")}`;
};

// During rotation both the current and previous secret are accepted. This keeps
// retries in flight valid while new deliveries immediately use the new secret.
const verifyWebhookSignature = (signature, payloadString, secrets) => {
  if (typeof signature !== "string" || !signature.startsWith("sha256="))
    return false;
  return secrets.filter(Boolean).some((secret) => {
    const expected = computeWebhookSignature(secret, payloadString);
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  });
};

// ---------------------------------------------------------------------------
// Timestamped signatures (#229)
// ---------------------------------------------------------------------------
//
// X-Orbit-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
//
// Signing the timestamp together with the body lets receivers reject replays:
// a captured request cannot be re-sent with a fresh timestamp without the secret.

const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

const signWebhookPayload = (
  secret,
  payloadString,
  timestamp = Math.floor(Date.now() / 1000),
) => {
  const v1 = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payloadString}`)
    .digest("hex");
  return { header: `t=${timestamp},v1=${v1}`, timestamp, v1 };
};

// Returns { timestamp, signatures } or null for a malformed header
const parseSignatureHeader = (header) => {
  if (typeof header !== "string") return null;
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value))
      signatures.push(value.toLowerCase());
  }
  return timestamp !== null && signatures.length ? { timestamp, signatures } : null;
};

/**
 * Verifies a `t=...,v1=...` header against the raw body. Rejects timestamps
 * outside `toleranceSeconds` of now (replay protection). Any of `secrets` may
 * match, so deliveries signed just before a secret rotation still verify.
 */
const verifyTimestampedSignature = (
  header,
  payloadString,
  secrets,
  { toleranceSeconds = WEBHOOK_SIGNATURE_TOLERANCE_SECONDS, now = Date.now } = {},
) => {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(Math.floor(now() / 1000) - parsed.timestamp) > toleranceSeconds)
    return false;
  return [].concat(secrets).filter(Boolean).some((secret) => {
    const expected = Buffer.from(
      signWebhookPayload(secret, payloadString, parsed.timestamp).v1,
      "hex",
    );
    return parsed.signatures.some((candidate) => {
      const actual = Buffer.from(candidate, "hex");
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    });
  });
};

const signedDeliveryHeaders = ({ secret, payloadString, eventType, deliveryId, attempt, extra = {} }) => {
  const { header, timestamp } = signWebhookPayload(secret, payloadString);
  return {
    "Content-Type": "application/json",
    "User-Agent": "Orbit-Webhooks/1.0",
    "X-Orbit-Signature": header,
    "X-Orbit-Event": eventType,
    "X-Orbit-Delivery": deliveryId,
    "X-Orbit-Timestamp": new Date(timestamp * 1000).toISOString(),
    ...(attempt ? { "X-Orbit-Attempt": String(attempt) } : {}),
    ...extra,
  };
};

// ---------------------------------------------------------------------------
// Retries and dead-letter queue (#229)
// ---------------------------------------------------------------------------

const WEBHOOK_MAX_ATTEMPTS = 5;
const WEBHOOK_TIMEOUT_MS = 6000;

const retryConfigFromEnv = (env = process.env) => ({
  maxAttempts: Number(env.WEBHOOK_MAX_ATTEMPTS) || WEBHOOK_MAX_ATTEMPTS,
  baseDelayMs: Number(env.WEBHOOK_RETRY_BASE_MS) || 30_000,
  maxDelayMs: Number(env.WEBHOOK_RETRY_MAX_MS) || 30 * 60_000,
});

/**
 * Delay before the next attempt after `failedAttempt` (1-based) failed:
 * exponential (base * 2^(n-1), capped at maxDelayMs) with "equal jitter", i.e. a
 * random value in [delay/2, delay], so many endpoints failing together do not
 * retry in lockstep.
 */
const webhookRetryDelayMs = (
  failedAttempt,
  { baseDelayMs, maxDelayMs, random = Math.random } = retryConfigFromEnv(),
) => {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.round(exponential / 2 + random() * (exponential / 2));
};

// Default scheduler: an unref'd timer, so pending retries never block request
// handling or keep the process alive on shutdown.
const defaultSchedule = (fn, delayMs) => {
  const timer = setTimeout(fn, delayMs);
  timer.unref?.();
  return timer;
};

// One HTTP attempt. Non-2xx responses, network errors and timeouts are failures.
const postWebhook = async (fetchImpl, url, headers, payloadString, timeoutMs = WEBHOOK_TIMEOUT_MS) => {
  if (typeof fetchImpl !== "function" || !url) {
    return { ok: true, responseStatus: 200, responseBody: '{"received":true}' };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: payloadString,
      signal: controller.signal,
    });
    return {
      ok: Boolean(res.ok),
      responseStatus: res.status,
      responseBody: await res.text().catch(() => ""),
    };
  } catch (err) {
    return {
      ok: false,
      responseStatus: 500,
      responseBody: err?.name === "AbortError" ? "Request timed out" : err?.message || "Connection error",
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Retries a failed delivery until it succeeds or `maxAttempts` is reached, then
 * archives it in webhook_dead_letters. Runs entirely off the caller's path:
 * every attempt is scheduled with `schedule(fn, delayMs)`.
 */
const scheduleWebhookRetry = ({
  supabase,
  webhook,
  merchantId,
  eventType,
  payload,
  payloadString,
  deliveryId,
  failedAttempt,
  fetchImpl,
  retry,
}) => {
  const config = { ...retryConfigFromEnv(), ...retry };
  const schedule = config.schedule || defaultSchedule;
  const attempt = failedAttempt + 1;

  schedule(async () => {
    try {
      const headers = signedDeliveryHeaders({
        secret: webhook.signing_secret,
        payloadString,
        eventType,
        deliveryId,
        attempt,
      });
      const result = await postWebhook(fetchImpl, webhook.url, headers, payloadString);
      recordWebhookDelivery(result.ok ? "success" : "failed");
      const exhausted = !result.ok && attempt >= config.maxAttempts;
      const nextDelay = result.ok || exhausted ? null : webhookRetryDelayMs(attempt, config);

      await supabase
        .from("webhook_deliveries")
        .update({
          attempt_count: attempt,
          response_status: result.responseStatus,
          response_body: result.responseBody,
          request_headers: headers,
          status: result.ok ? "success" : exhausted ? "dead_lettered" : "retrying",
          next_retry_at: nextDelay === null ? null : new Date(Date.now() + nextDelay).toISOString(),
        })
        .eq("id", deliveryId);

      notifyDeliveryObserver({
        merchantId,
        webhook,
        eventType,
        responseStatus: result.responseStatus,
        deliveryId,
      });

      if (exhausted) {
        await moveToDeadLetterQueue(supabase, {
          deliveryId,
          webhook,
          merchantId,
          eventType,
          payload,
          attemptCount: attempt,
          responseStatus: result.responseStatus,
          responseBody: result.responseBody,
        });
      } else if (!result.ok) {
        scheduleWebhookRetry({
          supabase, webhook, merchantId, eventType, payload, payloadString,
          deliveryId, failedAttempt: attempt, fetchImpl, retry,
        });
      }
    } catch (err) {
      console.error(`Webhook retry ${attempt} for delivery ${deliveryId} failed:`, err);
    }
  }, webhookRetryDelayMs(failedAttempt, config));
};

const moveToDeadLetterQueue = async (supabase, {
  deliveryId,
  webhook,
  merchantId,
  eventType,
  payload,
  attemptCount,
  responseStatus,
  responseBody,
}) => {
  const { error } = await supabase.from("webhook_dead_letters").insert([
    {
      delivery_id: deliveryId,
      webhook_id: webhook.id,
      merchant_id: merchantId,
      event_type: eventType,
      payload,
      destination_url: webhook.url,
      attempt_count: attemptCount,
      last_response_status: responseStatus,
      last_response_body: responseBody,
      failed_at: new Date().toISOString(),
    },
  ]);
  if (error) {
    console.error(`Failed to archive webhook delivery ${deliveryId} in the dead-letter queue:`, error);
    return;
  }
  recordWebhookDelivery("dead_lettered");
};

/**
 * Manually re-sends a dead-lettered delivery once, with a fresh signature, and
 * records the outcome on the dead-letter row. Returns the updated row, or null
 * when the dead letter does not exist (or belongs to another merchant).
 */
const replayDeadLetter = async (
  supabase,
  deadLetterId,
  { merchantId, fetchImpl = globalThis.fetch } = {},
) => {
  if (!supabase || !deadLetterId) return null;
  let query = supabase
    .from("webhook_dead_letters")
    .select("*, webhooks(*)")
    .eq("id", deadLetterId);
  if (merchantId) query = query.eq("merchant_id", merchantId);
  const { data: deadLetter, error } = await query.maybeSingle();
  if (error) throw error;
  if (!deadLetter) return null;

  const webhook = deadLetter.webhooks;
  const url = webhook?.url || deadLetter.destination_url;
  const secret = webhook?.signing_secret;
  if (!url || !secret) {
    const err = new Error("The webhook endpoint for this dead letter no longer exists");
    err.status = 409;
    throw err;
  }

  const payloadString = JSON.stringify(deadLetter.payload);
  const headers = signedDeliveryHeaders({
    secret,
    payloadString,
    eventType: deadLetter.event_type,
    deliveryId: deadLetter.delivery_id || deadLetter.id,
    extra: { "X-Orbit-Replay": "true" },
  });
  const result = await postWebhook(fetchImpl, url, headers, payloadString);
  recordWebhookDelivery(result.ok ? "success" : "failed");

  const { data: updated, error: updateErr } = await supabase
    .from("webhook_dead_letters")
    .update({
      replayed_at: new Date().toISOString(),
      replay_status: result.ok ? "success" : "failed",
      last_response_status: result.responseStatus,
      last_response_body: result.responseBody,
    })
    .eq("id", deadLetterId)
    .select()
    .single();
  if (updateErr) throw updateErr;
  return updated;
};

// Optional hook called after every delivery attempt (dispatch and resend). The
// alerting bridge uses it for failure telemetry. It runs off the request path, so
// a slow or failing alert destination never delays or fails a delivery.
let deliveryObserver = null;

const setDeliveryObserver = (observer) => {
  deliveryObserver = typeof observer === "function" ? observer : null;
};

const notifyDeliveryObserver = (event) => {
  if (!deliveryObserver) return;
  Promise.resolve()
    .then(() => deliveryObserver(event))
    .catch((err) => console.error("Webhook delivery observer failed:", err));
};

/**
 * Dispatches an event to all active webhooks subscribed to this merchant and event type
 */
const dispatchWebhookEvent = async (
  supabase,
  { merchantId, eventType, payload, fetchImpl = globalThis.fetch, retry },
) => {
  if (!supabase || !merchantId) return [];

  try {
    const { data: webhooks, error } = await supabase
      .from("webhooks")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("active", true);

    if (error || !webhooks || webhooks.length === 0) {
      return [];
    }

    const matchingWebhooks = webhooks.filter((wh) => {
      if (!wh.events || !Array.isArray(wh.events)) return true;
      return wh.events.includes("*") || wh.events.includes(eventType);
    });

    const deliveries = [];
    const payloadString = JSON.stringify(payload);

    const retryConfig = { ...retryConfigFromEnv(), ...retry };

    for (const wh of matchingWebhooks) {
      const webhook = { ...wh, signing_secret: wh.signing_secret || generateSigningSecret() };
      const deliveryId = crypto.randomUUID();
      const headers = signedDeliveryHeaders({
        secret: webhook.signing_secret,
        payloadString,
        eventType,
        deliveryId,
        attempt: 1,
      });

      // First attempt inline; any retries run later on timers (#229)
      const { ok, responseStatus, responseBody } = await postWebhook(
        fetchImpl,
        wh.url,
        headers,
        payloadString,
      );
      recordWebhookDelivery(ok ? "success" : "failed");
      const willRetry = !ok && retryConfig.maxAttempts > 1;
      const status = ok ? "success" : willRetry ? "retrying" : "dead_lettered";
      const firstRetryDelay = willRetry ? webhookRetryDelayMs(1, retryConfig) : null;

      const { data: deliveryRecord, error: deliveryErr } = await supabase
        .from("webhook_deliveries")
        .insert([
          {
            id: deliveryId,
            webhook_id: wh.id,
            merchant_id: merchantId,
            event_type: eventType,
            payload,
            request_headers: headers,
            response_status: responseStatus,
            response_body: responseBody,
            attempt_count: 1,
            status,
            next_retry_at: firstRetryDelay === null
              ? null
              : new Date(Date.now() + firstRetryDelay).toISOString(),
          },
        ])
        .select()
        .single();

      notifyDeliveryObserver({
        merchantId,
        webhook: wh,
        eventType,
        responseStatus,
        deliveryId,
      });

      if (!deliveryErr && deliveryRecord) {
        deliveries.push(deliveryRecord);
      }

      if (willRetry) {
        scheduleWebhookRetry({
          supabase,
          webhook,
          merchantId,
          eventType,
          payload,
          payloadString,
          deliveryId,
          failedAttempt: 1,
          fetchImpl,
          retry: retryConfig,
        });
      } else if (!ok) {
        await moveToDeadLetterQueue(supabase, {
          deliveryId, webhook, merchantId, eventType, payload,
          attemptCount: 1, responseStatus, responseBody,
        });
      }
    }

    return deliveries;
  } catch (err) {
    console.error("Error dispatching webhook event:", err);
    return [];
  }
};

/**
 * Redelivers a specific webhook delivery attempt
 */
const resendWebhookDelivery = async (
  supabase,
  deliveryId,
  fetchImpl = globalThis.fetch,
) => {
  if (!supabase || !deliveryId) return null;

  const { data: delivery, error: delErr } = await supabase
    .from("webhook_deliveries")
    .select("*, webhooks(*)")
    .eq("id", deliveryId)
    .single();

  if (delErr || !delivery) {
    return null;
  }

  const wh = delivery.webhooks;
  const destinationUrl = wh?.url || delivery.destination_url;
  const secret = wh?.signing_secret || "whsec_default_secret";
  const payloadString = JSON.stringify(delivery.payload);
  const headers = signedDeliveryHeaders({
    secret,
    payloadString,
    eventType: delivery.event_type,
    deliveryId,
    extra: { "X-Orbit-Resend": "true" },
  });

  let responseStatus = 0;
  let responseBody = "";
  let status = "failed";

  try {
    if (typeof fetchImpl === "function" && destinationUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetchImpl(destinationUrl, {
        method: "POST",
        headers,
        body: payloadString,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      responseStatus = res.status;
      responseBody = await res.text().catch(() => "");
      status = res.ok ? "success" : "failed";
    } else {
      responseStatus = 200;
      responseBody = '{"received":true,"resend":true}';
      status = "success";
    }
  } catch (err) {
    responseStatus = 500;
    responseBody = err.message || "Connection error";
    status = "failed";
  }

  const { data: updated, error: updateErr } = await supabase
    .from("webhook_deliveries")
    .update({
      attempt_count: (delivery.attempt_count || 1) + 1,
      response_status: responseStatus,
      response_body: responseBody,
      status,
      request_headers: headers,
    })
    .eq("id", deliveryId)
    .select()
    .single();

  notifyDeliveryObserver({
    merchantId: delivery.merchant_id,
    webhook: wh || { id: delivery.webhook_id, url: destinationUrl },
    eventType: delivery.event_type,
    responseStatus,
    deliveryId,
  });

  if (updateErr) throw updateErr;
  return updated;
};

const backfillWebhookSchema = z.object({
  event_types: z
    .union([z.array(z.string()), z.string().transform((s) => [s])])
    .optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

/**
 * Replays historical webhook events for a specific webhook endpoint with rate limiting.
 */
const replayWebhookEvents = async (
  supabase,
  {
    webhookId,
    eventTypes = ["*"],
    startDate,
    endDate,
    fetchImpl = globalThis.fetch,
    sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    rateLimitPerSecond = 10,
  },
) => {
  if (!supabase || !webhookId)
    return { total_events: 0, replayed_count: 0, deliveries: [] };

  // 1. Fetch webhook destination
  const { data: wh, error: whErr } = await supabase
    .from("webhooks")
    .select("*")
    .eq("id", webhookId)
    .single();

  if (whErr || !wh) {
    const notFoundErr = new Error("Webhook not found");
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  // 2. Query historical events matching criteria from webhook_events (or fallback to webhook_deliveries)
  let query = supabase
    .from("webhook_events")
    .select("*")
    .eq("merchant_id", wh.merchant_id);

  const filterTypes = Array.isArray(eventTypes)
    ? eventTypes
    : eventTypes
      ? [eventTypes]
      : ["*"];
  const shouldFilterTypes =
    filterTypes.length > 0 && !filterTypes.includes("*");

  if (shouldFilterTypes) {
    query = query.in("event_type", filterTypes);
  }
  if (startDate) {
    query = query.gte("created_at", new Date(startDate).toISOString());
  }
  if (endDate) {
    query = query.lte("created_at", new Date(endDate).toISOString());
  }
  query = query.order("created_at", { ascending: true });

  let { data: events, error: evErr } = await query;

  // Fallback to webhook_deliveries if webhook_events is not populated
  if (evErr || !events || events.length === 0) {
    let fallbackQuery = supabase
      .from("webhook_deliveries")
      .select("*")
      .eq("merchant_id", wh.merchant_id);

    if (shouldFilterTypes) {
      fallbackQuery = fallbackQuery.in("event_type", filterTypes);
    }
    if (startDate) {
      fallbackQuery = fallbackQuery.gte(
        "created_at",
        new Date(startDate).toISOString(),
      );
    }
    if (endDate) {
      fallbackQuery = fallbackQuery.lte(
        "created_at",
        new Date(endDate).toISOString(),
      );
    }
    fallbackQuery = fallbackQuery.order("created_at", { ascending: true });

    const { data: fallbackEvents } = await fallbackQuery;
    if (fallbackEvents && fallbackEvents.length > 0) {
      // Deduplicate fallback delivery events by id or payload timestamp if multiple deliveries exist
      events = fallbackEvents;
    }
  }

  if (!events || events.length === 0) {
    return { total_events: 0, replayed_count: 0, deliveries: [] };
  }

  // 3. Rate limiting delay calculation: 10 events/sec -> 100ms per event
  const delayMs =
    rateLimitPerSecond > 0 ? Math.ceil(1000 / rateLimitPerSecond) : 0;
  const secret = wh.signing_secret || generateSigningSecret();
  const deliveries = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const eventType = ev.event_type;

    // Skip if webhook is not subscribed to this event type
    if (
      wh.events &&
      Array.isArray(wh.events) &&
      !wh.events.includes("*") &&
      !wh.events.includes(eventType)
    ) {
      continue;
    }

    // Throttle delivery
    if (i > 0 && delayMs > 0 && typeof sleepImpl === "function") {
      await sleepImpl(delayMs);
    }

    // Preserve original timestamp in payload metadata
    const rawPayload =
      typeof ev.payload === "string"
        ? JSON.parse(ev.payload)
        : ev.payload || {};
    const originalTimestamp =
      ev.created_at ||
      rawPayload.timestamp ||
      rawPayload.settled_at ||
      new Date().toISOString();

    const replayedPayload = {
      ...rawPayload,
      metadata: {
        ...(rawPayload.metadata || {}),
        original_timestamp: originalTimestamp,
        replayed: true,
        replayed_at: new Date().toISOString(),
      },
    };

    const payloadString = JSON.stringify(replayedPayload);
    const deliveryId = crypto.randomUUID();
    const headers = signedDeliveryHeaders({
      secret,
      payloadString,
      eventType,
      deliveryId,
      extra: { "X-Orbit-Replay": "true" },
    });

    let responseStatus = 0;
    let responseBody = "";
    let status = "failed";

    try {
      if (typeof fetchImpl === "function" && wh.url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetchImpl(wh.url, {
          method: "POST",
          headers,
          body: payloadString,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        responseStatus = res.status;
        responseBody = await res.text().catch(() => "");
        status = res.ok ? "success" : "failed";
      } else {
        responseStatus = 200;
        responseBody = '{"received":true,"replay":true}';
        status = "success";
      }
    } catch (fetchErr) {
      responseStatus = 500;
      responseBody = fetchErr.message || "Connection error";
      status = "failed";
    }

    const { data: deliveryRecord, error: deliveryErr } = await supabase
      .from("webhook_deliveries")
      .insert([
        {
          id: deliveryId,
          webhook_id: wh.id,
          merchant_id: wh.merchant_id,
          event_type: eventType,
          payload: replayedPayload,
          request_headers: headers,
          response_status: responseStatus,
          response_body: responseBody,
          attempt_count: 1,
          status,
        },
      ])
      .select()
      .single();

    if (!deliveryErr && deliveryRecord) {
      deliveries.push(deliveryRecord);
    } else {
      deliveries.push({
        id: deliveryId,
        webhook_id: wh.id,
        merchant_id: wh.merchant_id,
        event_type: eventType,
        payload: replayedPayload,
        request_headers: headers,
        response_status: responseStatus,
        status,
      });
    }
  }

  return {
    total_events: events.length,
    replayed_count: deliveries.length,
    deliveries,
  };
};

module.exports = {
  createWebhookSchema,
  updateWebhookSchema,
  backfillWebhookSchema,
  generateSigningSecret,
  computeWebhookSignature,
  verifyWebhookSignature,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
  signWebhookPayload,
  parseSignatureHeader,
  verifyTimestampedSignature,
  webhookRetryDelayMs,
  replayDeadLetter,
  dispatchWebhookEvent,
  resendWebhookDelivery,
  replayWebhookEvents,
  setDeliveryObserver,
};
