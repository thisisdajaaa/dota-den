import { describe, expect, it, vi } from "vitest";
import { parseRetryAfter, ProviderGateway } from "@/common/providers/provider-gateway";

function gateway(
  responses: Array<Response | Error>,
  extra: Partial<ConstructorParameters<typeof ProviderGateway>[0]> = {},
) {
  let t = 0;
  const fetch = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async (ms: number) => {
    t += ms;
  });
  const gw = new ProviderGateway({
    name: "test",
    fetch,
    sleep,
    now: () => t,
    random: () => 0.5,
    ...extra,
  });
  return { gw, fetch, sleep, advance: (ms: number) => (t += ms) };
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("ProviderGateway", () => {
  it("lets the body decide how long to cache it", async () => {
    const { gw, fetch, advance } = gateway([
      json({ version: null }),
      json({ version: null }),
      json({ version: 22 }),
    ]);
    const opts = {
      cacheTtlMs: 600_000,
      cacheTtlFor: (b: unknown) => ((b as { version: unknown }).version ? 600_000 : 90_000),
    };
    await gw.getJson("https://x/m", opts);
    await gw.getJson("https://x/m", opts); // cached (90s)
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(91_000);
    await gw.getJson("https://x/m", opts); // short cache expired
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a success only when cacheIf accepts the body", async () => {
    const { gw, fetch } = gateway([
      json({ rows: null, err: "timeout" }),
      json({ rows: [1], err: null }),
      json({ rows: [2], err: null }),
    ]);
    const cacheIf = (b: unknown) => Array.isArray((b as { rows?: unknown }).rows);
    const opts = { cacheTtlMs: 60_000, cacheIf };
    expect((await gw.getJson("https://x/q", opts)).ok).toBe(true); // error inside: not cached
    expect(await gw.getJson("https://x/q", opts)).toMatchObject({ body: { rows: [1] } });
    expect(await gw.getJson("https://x/q", opts)).toMatchObject({ body: { rows: [1] } }); // cached
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets one call skip retries and stay off the circuit breaker", async () => {
    const failures = Array.from({ length: 6 }, () => json({}, 503));
    const { gw, fetch } = gateway([...failures, json({ ok: 1 })], { failureThreshold: 5 });
    for (let i = 0; i < 6; i++) {
      expect(
        await gw.getJson(`https://x/search?q=${i}`, { maxRetries: 0, isolated: true }),
      ).toMatchObject({ ok: false, kind: "failed" });
    }
    expect(fetch).toHaveBeenCalledTimes(6); // one attempt each, no retries
    // Six isolated failures didn't open the circuit for everyone else.
    expect((await gw.getJson("https://x/players/1")).ok).toBe(true);
  });

  it("returns parsed JSON on success", async () => {
    const { gw } = gateway([json({ a: 1 })]);
    expect(await gw.getJson("https://x/a")).toEqual({ ok: true, status: 200, body: { a: 1 } });
  });

  it("retries 5xx and network errors with backoff, then succeeds", async () => {
    const { gw, fetch, sleep } = gateway([
      json({}, 502),
      new TypeError("fetch failed"),
      json({ ok: 1 }),
    ]);
    expect((await gw.getJson("https://x/a")).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after bounded retries", async () => {
    const { gw, fetch } = gateway([json({}, 500), json({}, 500), json({}, 500), json({}, 500)]);
    expect(await gw.getJson("https://x/a")).toMatchObject({
      ok: false,
      kind: "failed",
      status: 500,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry 4xx and maps 404 to not_found", async () => {
    const { gw, fetch } = gateway([json({}, 404)]);
    expect(await gw.getJson("https://x/a")).toMatchObject({ ok: false, kind: "not_found" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces 429 with a long Retry-After instead of waiting", async () => {
    const { gw, sleep } = gateway([json({}, 429, { "retry-after": "60" })]);
    expect(await gw.getJson("https://x/a")).toEqual({
      ok: false,
      kind: "rate_limited",
      status: 429,
      retryAfterMs: 60_000,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits out a short Retry-After and retries", async () => {
    const { gw, sleep } = gateway([json({}, 429, { "retry-after": "1" }), json({ ok: 1 })]);
    expect((await gw.getJson("https://x/a")).ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("deduplicates concurrent identical requests", async () => {
    const { gw, fetch } = gateway([json({ a: 1 })]);
    const [a, b] = await Promise.all([gw.getJson("https://x/a"), gw.getJson("https://x/a")]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches successful responses for the TTL", async () => {
    const { gw, fetch, advance } = gateway([json({ v: 1 }), json({ v: 2 })]);
    expect(await gw.getJson("https://x/a", { cacheTtlMs: 1000 })).toMatchObject({ body: { v: 1 } });
    expect(await gw.getJson("https://x/a", { cacheTtlMs: 1000 })).toMatchObject({ body: { v: 1 } });
    advance(1001);
    expect(await gw.getJson("https://x/a", { cacheTtlMs: 1000 })).toMatchObject({ body: { v: 2 } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("serves the last good answer when the upstream fails after it expires", async () => {
    const onStale = vi.fn();
    const { gw, advance } = gateway([json({ v: 1 }), json({}, 503), json({}, 503), json({}, 503)], {
      onStale,
      maxRetries: 2,
    });
    const opts = { cacheTtlMs: 60_000 };
    await gw.getJson("https://x/h", opts);
    advance(90_000); // expired 30s ago: within the stale window (as long again as the TTL)
    expect(await gw.getJson("https://x/h", opts)).toMatchObject({ ok: true, body: { v: 1 } });
    expect(onStale).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x/h", failure: "failed" }),
    );
  });

  it("doesn't serve an answer past the stale window, or stand in for a not-found", async () => {
    const { gw, advance } = gateway([
      json({ v: 1 }),
      json({}, 503),
      json({}, 503),
      json({}, 503),
      json({ v: 2 }),
      json({}, 404),
    ]);
    const opts = { cacheTtlMs: 60_000 };
    await gw.getJson("https://x/h", opts);
    advance(200_000); // 140s past expiry: too old
    expect(await gw.getJson("https://x/h", opts)).toMatchObject({ ok: false, kind: "failed" });
    await gw.getJson("https://x/h", opts); // { v: 2 }
    advance(61_000);
    expect(await gw.getJson("https://x/h", opts)).toMatchObject({ kind: "not_found" });
  });

  it("opens the circuit after repeated failures and recovers after the open window", async () => {
    const { gw, fetch, advance } = gateway([json({}, 400), json({}, 400), json({ ok: 1 })], {
      failureThreshold: 2,
      openForMs: 10_000,
      maxRetries: 0,
    });
    expect(gw.health()).toEqual({
      circuitOpen: false,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
    });
    await gw.getJson("https://x/1");
    await gw.getJson("https://x/2");
    expect(await gw.getJson("https://x/3")).toEqual({ ok: false, kind: "circuit_open" });
    expect(fetch).toHaveBeenCalledTimes(2);
    // Owner alerts read this snapshot: open, with the last failure and no success yet.
    expect(gw.health()).toMatchObject({ circuitOpen: true, lastSuccessAt: null, lastFailureAt: 0 });
    advance(10_001);
    expect((await gw.getJson("https://x/3")).ok).toBe(true);
    expect(gw.health()).toMatchObject({ circuitOpen: false, lastSuccessAt: 10_001 });
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and rejects garbage", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});
