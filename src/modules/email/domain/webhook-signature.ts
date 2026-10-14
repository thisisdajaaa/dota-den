import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend signs its webhooks with Svix (pure, no I/O):
 *
 * - Headers `svix-id`, `svix-timestamp` (seconds since the epoch) and `svix-signature`, a
 *   space-separated list of `v1,<base64 HMAC>` entries (more than one while a secret rotates).
 * - The signed content is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with the base64-decoded
 *   part of the secret after `whsec_`.
 *
 * The body must be the exact bytes received: parsing and re-serialising it changes the signature.
 */

/** Requests signed further than this from our clock are refused (replay protection). */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export type WebhookSignatureFailure =
  "missing_headers" | "bad_secret" | "bad_timestamp" | "stale_timestamp" | "no_match";

export interface WebhookSignatureInput {
  /** `whsec_<base64>` from the Resend dashboard. */
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now: Date;
}

/** The HMAC key inside a `whsec_` secret, or null when it isn't one. */
export function webhookKey(secret: string): Buffer | null {
  const m = /^whsec_([A-Za-z0-9+/]+={0,2})$/.exec(secret.trim());
  if (!m) return null;
  const key = Buffer.from(m[1], "base64");
  return key.length > 0 ? key : null;
}

/** The `v1,<base64>` value Svix would send for this message (also used to sign test requests). */
export function signWebhook(secret: string, id: string, timestamp: string, body: string): string {
  const key = webhookKey(secret);
  if (!key) throw new Error("Webhook secrets start with whsec_");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

/** Null when the request is signed with this secret and fresh, else why it isn't. */
export function verifyWebhookSignature(
  input: WebhookSignatureInput,
): WebhookSignatureFailure | null {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature) return "missing_headers";
  const key = webhookKey(input.secret);
  if (!key) return "bad_secret";
  if (!/^\d{1,12}$/.test(timestamp)) return "bad_timestamp";
  if (Math.abs(input.now.getTime() - Number(timestamp) * 1000) > WEBHOOK_TOLERANCE_MS)
    return "stale_timestamp";

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  for (const entry of signature.split(" ")) {
    const [version, value, ...rest] = entry.split(",");
    if (version !== "v1" || !value || rest.length > 0) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return null;
  }
  return "no_match";
}
