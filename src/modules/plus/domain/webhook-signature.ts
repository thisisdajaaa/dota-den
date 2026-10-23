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
