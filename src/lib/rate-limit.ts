import "server-only";

/**
 * Small in-memory sliding-window limiter, per server instance. Good enough to blunt abuse
 * of paid upstream calls on a prototype; swap for a shared store (e.g. Redis) at scale.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) buckets.clear(); // bound memory
  return true;
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
