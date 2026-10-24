/** Longest path we carry through sign-in; anything longer is dropped, not truncated. */
const MAX_LENGTH = 512;
const PROBE_ORIGIN = "http://return-path.invalid";

/**
 * Where to land after sign-in: a same-origin relative path such as `/matches?queue=party`, or
 * null. Guards against open redirects: the value must start with a single "/" (not "//",
 * which browsers read as another host), with no backslashes (browsers treat "/\" like "//")
 * or control characters, and must stay on our origin once resolved. API routes are refused so
 * sign-in never bounces back into the auth endpoints.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  // Resolving can turn "/.//evil.com" or "/%2e//evil.com" into "//evil.com": check again.
  if (url.pathname.startsWith("//")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in URL, carrying `next` when it's a safe return path. */
export function signInHref(next: unknown): string {
  const path = safeReturnPath(next);
  return path
    ? `/api/v1/auth/steam/login?next=${encodeURIComponent(path)}`
    : "/api/v1/auth/steam/login";
}
