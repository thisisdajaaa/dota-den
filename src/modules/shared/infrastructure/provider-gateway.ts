/**
 * Outbound HTTP for upstream providers (spec §6): timeout, bounded retries with
 * jitter, Retry-After, a light circuit breaker, in-flight dedup and a TTL cache.
 * Circuit, dedup and the first cache layer are per server instance. Optionally (ADR 0008)
 * a shared cache sits behind the local one and a shared budget caps upstream calls.
 */

/** Cache shared by all instances (e.g. Redis). Implementations may throw; we fail open. */
export interface SharedResponseCache {
  get(key: string): Promise<{ value: GatewayResponse; expiresAt: number } | null>;
  set(key: string, value: GatewayResponse, ttlMs: number): Promise<void>;
}

/** Global call budget. `take` reserves one upstream call; false when exhausted. */
export interface UpstreamBudget {
  take(): Promise<{ allowed: boolean; retryAfterMs: number | null }>;
}
export type GatewayResponse =
  | {
      ok: true;
      status: number;
      body: unknown;
      /** When the body was fetched upstream (ms epoch); set when it came from a cache. */
      fetchedAt?: number;
    }
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
  /** Second cache layer shared across instances; only used for GETs with `cacheTtlMs`. */
  sharedCache?: SharedResponseCache;
  /** Checked before every upstream call (each retry counts). */
  budget?: UpstreamBudget;
  /** Shared cache or budget store failed; the gateway carried on without it. */
  onSharedError?: (event: { op: "cache_get" | "cache_set" | "budget"; error: unknown }) => void;
}

interface CacheEntry {
  expiresAt: number;
  value: GatewayResponse;
}

/** Per-call overrides of the gateway's timeout and retries. */
export interface CallOptions {
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Failures don't count toward the circuit breaker: for slow, user-triggered calls (like
   * search) that shouldn't take the rest of the provider down with them.
   */
  isolated?: boolean;
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
    opts: {
      cacheTtlMs?: number;
      headers?: HeadersInit;
      /** Cache a successful response only if this accepts its body (e.g. no error inside). */
      cacheIf?: (body: unknown) => boolean;
    } & CallOptions = {},
  ): Promise<GatewayResponse> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > this.now) return cached.value;

    const pending = this.inFlight.get(url);
    if (pending) return pending;

    const request = this.fetchThroughShared(url, opts).finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, request);
    return request;
  }

  private async fetchThroughShared(
    url: string,
    opts: {
      cacheTtlMs?: number;
      headers?: HeadersInit;
      cacheIf?: (body: unknown) => boolean;
    } & CallOptions,
  ): Promise<GatewayResponse> {
    const shared = opts.cacheTtlMs ? this.opts.sharedCache : undefined;
    if (shared) {
      const hit = await shared.get(url).catch((error: unknown) => {
        this.opts.onSharedError?.({ op: "cache_get", error });
        return null;
      });
      if (hit && hit.expiresAt > this.now) {
        this.cache.set(url, hit);
        return hit.value;
      }
    }
    const res = await this.execute(url, opts.headers, opts);
    const cacheable = res.ok ? (opts.cacheIf?.(res.body) ?? true) : res.kind === "not_found";
    if (opts.cacheTtlMs && cacheable) {
      // Remember when it was fetched, so readers of the cache can show its real age.
      const value = res.ok ? { ...res, fetchedAt: this.now } : res;
      this.cache.set(url, { expiresAt: this.now + opts.cacheTtlMs, value });
      await shared?.set(url, value, opts.cacheTtlMs).catch((error: unknown) => {
        this.opts.onSharedError?.({ op: "cache_set", error });
      });
    }
    return res;
  }

  /** Reserve a call from the shared budget: null when allowed (or no budget, or store down). */
  private async overBudget(): Promise<GatewayResponse | null> {
    if (!this.opts.budget) return null;
    try {
      const { allowed, retryAfterMs } = await this.opts.budget.take();
      return allowed ? null : { ok: false, kind: "rate_limited", status: 429, retryAfterMs };
    } catch (error) {
      this.opts.onSharedError?.({ op: "budget", error });
      return null;
    }
  }

  /** Fire-and-check POST (no retries or caching); used for upstream "refresh" requests. */
  async postJson(url: string): Promise<GatewayResponse> {
    if (this.openUntil > this.now) return { ok: false, kind: "circuit_open" };
    const exhausted = await this.overBudget();
    if (exhausted) return exhausted;
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

  private async execute(
    url: string,
    headers?: HeadersInit,
    call: CallOptions = {},
  ): Promise<GatewayResponse> {
    if (this.openUntil > this.now) return { ok: false, kind: "circuit_open" };

    const fetchFn = this.opts.fetch ?? ((u, i) => fetch(u, i));
    const sleep = this.opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const maxRetries = call.maxRetries ?? this.opts.maxRetries ?? 2;
    const timeoutMs = call.timeoutMs ?? this.opts.timeoutMs ?? 8_000;
    let last: GatewayResponse = { ok: false, kind: "failed", status: null, cause: "no attempt" };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Out of shared budget: don't call upstream; callers take their degraded path.
      const exhausted = await this.overBudget();
      if (exhausted) return exhausted;
      const started = this.now;
      let status: number | null = null;
      try {
        const res = await fetchFn(url, {
          headers: { accept: "application/json", ...headers },
          signal: AbortSignal.timeout(timeoutMs),
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
        if (res.status < 500) return call.isolated ? last : this.recordFailure(last);
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
    return call.isolated ? last : this.recordFailure(last);
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
