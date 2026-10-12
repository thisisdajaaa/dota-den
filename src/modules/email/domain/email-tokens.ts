import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Links in emails carry signed tokens (HMAC-SHA256 with the server's email signing key):
 *
 * - Confirmation: `c1.<random>.<sig>`. Single use, 24 hours. Only its SHA-256 hash is stored,
 *   so a database leak can't confirm anyone. The signature lets us reject a forged or mangled
 *   link without a database lookup.
 * - Unsubscribe: `u1.<user>.<nonce>.<sig>`. Works signed-out and for as long as that
 *   subscription lasts. The nonce is new for every confirmed subscription, so a link from an
 *   older subscription can't end a newer one.
 */

export const CONFIRM_TOKEN_TTL_MS = 24 * 3_600_000;

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function sign(key: string, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function verify(key: string, payload: string, sig: string): boolean {
  const expected = Buffer.from(sign(key, payload));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomNonce(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** A new confirmation token and the hash to store for it. */
export function newConfirmationToken(key: string): { token: string; hash: string } {
  const random = randomNonce(32);
  const token = `c1.${random}.${sign(key, `confirm:${random}`)}`;
  return { token, hash: hashToken(token) };
}

/** The hash to look up for a confirmation token, or null when it isn't one of ours. */
export function confirmationTokenHash(key: string, token: string): string | null {
  const [v, random, sig, ...rest] = token.split(".");
  if (v !== "c1" || !random || !sig || rest.length > 0) return null;
  return verify(key, `confirm:${random}`, sig) ? hashToken(token) : null;
}

export function unsubscribeToken(key: string, userId: string, nonce: string): string {
  return `u1.${b64url(userId)}.${nonce}.${sign(key, `unsubscribe:${userId}:${nonce}`)}`;
}

/** Who an unsubscribe token is for, or null when it isn't one of ours. */
export function readUnsubscribeToken(
  key: string,
  token: string,
): { userId: string; nonce: string } | null {
  const [v, user, nonce, sig, ...rest] = token.split(".");
  if (v !== "u1" || !user || !nonce || !sig || rest.length > 0) return null;
  const userId = fromB64url(user);
  return verify(key, `unsubscribe:${userId}:${nonce}`, sig) ? { userId, nonce } : null;
}
