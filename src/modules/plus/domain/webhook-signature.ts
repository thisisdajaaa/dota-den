import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lemon Squeezy webhook signatures (pure, no I/O). Verified against
 * https://docs.lemonsqueezy.com/help/webhooks/signing-requests (2026-10-23):
 *
 * - The `X-Signature` header holds the HMAC-SHA256 hex digest of the raw request body, keyed
 *   with the webhook's signing secret.
 * - The body must be the exact bytes received: parsing and re-serialising it changes the digest.
 *
 * Lemon Squeezy sends no timestamp or delivery id, so replays are stopped by the event store
 * (the same body is the same event), not here.
 */

/** The `X-Signature` value Lemon Squeezy would send for this body (also signs test requests). */
export function signLemonSqueezy(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * True only when a secret is set and the header is the body's HMAC under it. Compared in
 * constant time on the decoded bytes; anything that isn't 64 hex characters is refused first.
 */
export function verifyLemonSqueezySignature(input: {
  secret: string | null | undefined;
  signature: string | null | undefined;
  body: string;
}): boolean {
  const { secret, signature, body } = input;
  if (!secret || !signature) return false;
  const given = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  return timingSafeEqual(Buffer.from(given, "hex"), expected);
}

/**
 * Our id for one webhook event. Lemon Squeezy's payload has no event id, and a retry resends
 * the same body, so the SHA-256 of the body identifies the event: a replay or a retry of an
 * event we already handled is a no-op.
 */
export function webhookEventId(provider: string, body: string): string {
  return `${provider}:${createHash("sha256").update(body, "utf8").digest("hex")}`;
}

/**
 * Polar webhook signatures (Standard Webhooks, pure). Verified against
 * https://polar.sh/docs/integrate/webhooks/delivery and the Standard Webhooks spec
 * (https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md),
 * read 2026-11-18:
 *
 * - Headers `webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature`: one or
 *   more space-separated `v1,<base64 HMAC-SHA256>` entries.
 * - The signed content is `${id}.${timestamp}.${body}` (the exact body bytes).
 * - The key depends on when the secret was made. Secrets generated on or after
 *   2026-09-08 00:00 UTC are Standard Webhooks: the base64 after `whsec_` is the key. Older
 *   ones are "Polar HMAC": the key is the UTF-8 bytes of the whole `whsec_…` string. Polar's
 *   SDKs try both, and so do we (the endpoint's `uses_standard_webhook_signature` says which).
 * - Timestamps more than 5 minutes away from now (either way) are refused, so a captured
 *   delivery can't be replayed later; the event store stops replays inside that window.
 */
export const STANDARD_WEBHOOK_TOLERANCE_SEC = 5 * 60;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The HMAC keys a Polar `whsec_…` secret may stand for: Standard Webhooks first, then legacy. */
export function polarWebhookKeys(secret: string): Buffer[] {
  const keys: Buffer[] = [];
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  if (encoded.length > 0 && encoded.length % 4 === 0 && BASE64.test(encoded)) {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length > 0) keys.push(decoded);
  }
  keys.push(Buffer.from(secret, "utf8"));
  return keys;
}

/** The `v1,…` signature for one message under one key (also signs test requests). */
export function signStandardWebhook(
  key: Buffer,
  msg: { id: string; timestamp: string; body: string },
): string {
  const mac = createHmac("sha256", key)
    .update(`${msg.id}.${msg.timestamp}.${msg.body}`, "utf8")
    .digest("base64");
  return `v1,${mac}`;
}

/**
 * True only when a secret is set, the id and timestamp are present and well formed, the
 * timestamp is within the tolerance of `now`, and one of the header's `v1` signatures is the
 * HMAC of the message under one of the secret's keys. Compared in constant time on the
 * decoded bytes. Never throws.
 */
export function verifyPolarSignature(input: {
  secret: string | null | undefined;
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  body: string;
  now: Date;
  toleranceSec?: number;
}): boolean {
  const { secret, id, timestamp, signature, body, now } = input;
  if (!secret || !id || !timestamp || !signature) return false;
  if (id.length > 200 || !/^\d{1,12}$/.test(timestamp)) return false;
  const tolerance = input.toleranceSec ?? STANDARD_WEBHOOK_TOLERANCE_SEC;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > tolerance) return false;

  const given: Buffer[] = [];
  for (const entry of signature.trim().split(/\s+/).slice(0, 10)) {
    const comma = entry.indexOf(",");
    if (comma < 0 || entry.slice(0, comma) !== "v1") continue;
    const value = entry.slice(comma + 1);
    if (!BASE64.test(value)) continue;
    const bytes = Buffer.from(value, "base64");
    if (bytes.length === 32) given.push(bytes);
  }
  if (given.length === 0) return false;

  const content = `${id}.${timestamp}.${body}`;
  let ok = false;
  for (const key of polarWebhookKeys(secret)) {
    const expected = createHmac("sha256", key).update(content, "utf8").digest();
    // Check every candidate (no early exit), so timing doesn't tell which one matched.
    for (const g of given) ok = timingSafeEqual(g, expected) || ok;
  }
  return ok;
}
