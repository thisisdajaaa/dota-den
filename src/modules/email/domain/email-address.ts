/** Email addresses (pure). An address is personal data: never log one in full. */

/** RFC 5321's limit for a whole address. */
export const EMAIL_MAX_LENGTH = 254;

/**
 * A plain `local@domain.tld` address. Deliberately strict: no spaces, angle brackets, quotes,
 * commas or control characters, so an address can never smuggle a second recipient or a
 * header line into the message.
 */
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** Trimmed and lower-cased, so the same address typed twice is the same address. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isEmailAddress(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && ADDRESS.test(value);
}

/** "d***@example.com": enough to recognise your own address, for logs and the unsubscribe page. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
