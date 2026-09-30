/**
 * Errors users hit (pure). Only what helps fix them: never headers, cookies, query strings
 * or request bodies, which can carry sessions and personal data.
 */

export type ErrorSource = "server" | "client";

export interface ErrorEvent {
  source: ErrorSource;
  message: string;
  /** Next.js digest: links a client-side error to its server log. */
  digest: string | null;
  /** Page or API path, without the query string. */
  path: string | null;
  /** Route file pattern, e.g. /matches/[matchId] (server errors). */
  route: string | null;
  /** render, route, action or proxy (server); boundary (client). */
  kind: string | null;
  stack: string | null;
  at: Date;
  /** Groups repeats of the same error. */
  fingerprint: string;
}

export interface ErrorGroup {
  fingerprint: string;
  source: ErrorSource;
  message: string;
  route: string | null;
  path: string | null;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

/**
 * Not bugs: the visitor closed the tab or navigated away mid-response, so the stream or
 * request was cut off. Recording them would bury real errors.
 */
const NOISE = [/destination stream closed early/i, /^aborted$/i, /\bECONNRESET\b/, /AbortError/];

export function isNoise(message: string): boolean {
  return NOISE.some((re) => re.test(message));
}

const MAX_MESSAGE = 500;
const MAX_STACK = 2_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Path without query or fragment; ids and long numbers become `:n` for grouping. */
export function cleanPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const bare = path.split(/[?#]/)[0] ?? "";
  return bare.startsWith("/") ? clip(bare, 200) : null;
}

export function newErrorEvent(input: {
  source: ErrorSource;
  message: string;
  digest?: string | null;
  path?: string | null;
  route?: string | null;
  kind?: string | null;
  stack?: string | null;
  at: Date;
}): ErrorEvent {
  const message = clip(input.message.trim() || "Unknown error", MAX_MESSAGE);
  const path = cleanPath(input.path);
  const where = input.route ?? path?.replace(/\/\d{2,}/g, "/:n") ?? "?";
  // Numbers vary between occurrences (ids, timings); the shape of the message doesn't.
  const shape = message.replace(/\d+/g, "#").slice(0, 200);
  return {
    source: input.source,
    message,
    digest: input.digest ? clip(input.digest, 64) : null,
    path,
    route: input.route ?? null,
    kind: input.kind ?? null,
    stack: input.stack ? clip(input.stack, MAX_STACK) : null,
    at: input.at,
    fingerprint: `${input.source}|${where}|${shape}`,
  };
}
