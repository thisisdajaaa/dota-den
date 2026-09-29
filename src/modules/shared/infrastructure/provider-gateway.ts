/**
 * Outbound HTTP for upstream providers (spec §6): timeout, bounded retries with
 * jitter, Retry-After, a light circuit breaker, in-flight dedup and a TTL cache.
 * State is per server instance; that's the intended scope for a serverless prototype.
 */
export type GatewayResponse =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: "not_found"; status: 404 }
  | { ok: false; kind: "rate_limited"; status: 429; retryAfterMs: number | null }
  | { ok: false; kind: "circuit_open" }
  | { ok: false; kind: "failed"; status: number | null; cause: string };

export interface GatewayOptions {
  name: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  openForMs?: number;
  onRequest?: (event: {
    url: string;
    status: number | null;
    durationMs: number;
    attempt: number;
  }) => void;
}

interface CacheEntry {
  expiresAt: number;
  value: GatewayResponse;
}

export class ProviderGateway {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<GatewayResponse>>();
  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(private readonly opts: GatewayOptions) {}

  private get now(): number {
    return (this.opts.now ?? Date.now)();
  }

  async getJson(
    url: string,
    opts: { cacheTtlMs?: number; headers?: HeadersInit } = {},
  ): Promise<GatewayResponse> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > this.now) return cached.value;

    const pending = this.inFlight.get(url);
    if (pending) return pending;

    const request = this.execute(url, opts.headers).finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, request);
    const res = await request;
    if (opts.cacheTtlMs && (res.ok || res.kind === "not_found")) {
      this.cache.set(url, { expiresAt: this.now + opts.cacheTtlMs, value: res });
    }
    return res;
  }

  /** Fire-and-check POST (no retries or caching); used for upstream "refresh" requests. */
  async postJson(url: string): Promise<GatewayResponse> {
    if (this.openUntil > this.now) return { ok: false, kind: "circuit_open" };
    const fetchFn = this.opts.fetch ?? ((u, i) => fetch(u, i));
    const started = this.now;
    let status: number | null = null;
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8_000),
      });
      status = res.status;
      if (res.ok) return { ok: true, status: res.status, body: await res.json().catch(() => null) };
      if (res.status === 429) {
        return {
          ok: false,
          kind: "rate_limited",
          status: 429,
          retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
        };
      }
      return { ok: false, kind: "failed", status: res.status, cause: `status ${res.status}` };
    } catch (e) {
      return {
        ok: false,
        kind: "failed",
        status: null,
        cause: e instanceof Error ? e.name : "unknown",
      };
    } finally {
      this.opts.onRequest?.({ url, status, durationMs: this.now - started, attempt: 0 });
    }
  }

  private async execute(url: string, headers?: HeadersInit): Promise<GatewayResponse> {
    if (this.openUntil > this.now) return { ok: false, kind: "circuit_open" };

    const fetchFn = this.opts.fetch ?? ((u, i) => fetch(u, i));
    const sleep = this.opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const maxRetries = this.opts.maxRetries ?? 2;
    let last: GatewayResponse = { ok: false, kind: "failed", status: null, cause: "no attempt" };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const started = this.now;
      let status: number | null = null;
      try {
        const res = await fetchFn(url, {
          headers: { accept: "application/json", ...headers },
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8_000),
        });
        status = res.status;
        if (res.ok) {
          const body: unknown = await res.json();
          this.recordSuccess();
          return { ok: true, status: res.status, body };
        }
        if (res.status === 404) {
          this.recordSuccess();
          return { ok: false, kind: "not_found", status: 404 };
        }
        if (res.status === 429) {
          const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
          last = { ok: false, kind: "rate_limited", status: 429, retryAfterMs };
          // Don't hammer a rate-limited upstream; surface it unless the wait is short.
          if (retryAfterMs === null || retryAfterMs > 5_000 || attempt === maxRetries) return last;
          await sleep(retryAfterMs);
          continue;
        }
        last = { ok: false, kind: "failed", status: res.status, cause: `status ${res.status}` };
        if (res.status < 500) return this.recordFailure(last);
      } catch (e) {
        last = {
          ok: false,
          kind: "failed",
          status: null,
          cause: e instanceof Error ? e.name : "unknown",
        };
      } finally {
        this.opts.onRequest?.({ url, status, durationMs: this.now - started, attempt });
      }
      if (attempt < maxRetries) await sleep(this.backoff(attempt));
    }
    return this.recordFailure(last);
  }

  private backoff(attempt: number): number {
    const base = (this.opts.baseDelayMs ?? 250) * 2 ** attempt;
    return base / 2 + (this.opts.random ?? Math.random)() * (base / 2);
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  private recordFailure(res: GatewayResponse): GatewayResponse {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= (this.opts.failureThreshold ?? 5)) {
      this.openUntil = this.now + (this.opts.openForMs ?? 30_000);
      this.consecutiveFailures = 0;
    }
    return res;
  }
}

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
