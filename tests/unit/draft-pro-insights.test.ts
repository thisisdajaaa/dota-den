import { describe, expect, it, vi } from "vitest";
import type { DraftMetaCache } from "@/modules/drafts/infrastructure/mongo-draft-meta-cache";
import {
  OpenDotaDraftInsights,
  toPositions,
  toProMeta,
  toSynergy,
} from "@/modules/drafts/infrastructure/opendota-draft-insights";
import type { ProviderGateway } from "@/modules/shared/infrastructure/provider-gateway";

const HOUR = 3_600_000;
const heroRows = { rows: [{ hero_id: 5, picks: "10", bans: 4, wins: 6 }], err: null };
const leagueRows = { rows: [{ league: " Fixture Major ", matches: 30 }] };
const pairRows = { rows: [{ h1: 7, h2: 3, games: 12, wins: 8 }] };
const positionRows = { rows: [{ hero_id: 9, pos1: 1, pos2: "2", pos3: 3, pos4: 104, pos5: 210 }] };

function gatewayFor(bodies: (sql: string) => unknown) {
  const getJson = vi.fn(async (url: string) => {
    const sql = new URL(url).searchParams.get("sql") ?? "";
    const body = bodies(sql);
    return body === undefined
      ? ({ ok: false, kind: "failed", status: 500, cause: "down" } as const)
      : ({ ok: true, status: 200, body } as const);
  });
  return { gateway: { getJson } as unknown as ProviderGateway, getJson };
}

const byQuery = (sql: string) =>
  sql.includes("lane_role")
    ? positionRows
    : sql.includes("player_matches a")
      ? pairRows
      : sql.includes("leagues")
        ? leagueRows
        : sql.includes("picks_bans")
          ? heroRows
          : undefined;

function memoryCache(seed: Record<string, { body: unknown; ageMs: number }> = {}, now = 0) {
  const store = new Map(
    Object.entries(seed).map(([k, v]) => [k, { body: v.body, fetchedAt: new Date(now - v.ageMs) }]),
  );
  const cache: DraftMetaCache = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, body, at) => void store.set(k, { body, fetchedAt: at }),
  };
  return { cache, store };
}

describe("explorer parsing", () => {
  it("builds tournament stats, coercing string counts and trimming names", () => {
    const pro = toProMeta(heroRows, leagueRows)!;
    expect(pro.matches).toBe(30);
    expect(pro.leagues).toEqual([{ name: "Fixture Major", matches: 30 }]);
    expect(pro.heroes.get(5)).toEqual({ picks: 10, bans: 4, wins: 6 });
  });

  it("treats an explorer error or empty window as no data", () => {
    expect(toProMeta({ rows: null, err: "timeout" }, leagueRows)).toBeNull();
    expect(toProMeta(heroRows, { rows: [] })).toBeNull();
    expect(toSynergy({ err: "boom" })).toBeNull();
  });

  it("reads position counts per hero", () => {
    expect(toPositions(positionRows)!.get(9)).toEqual({ counts: [1, 2, 3, 104, 210], games: 320 });
    expect(toPositions({ rows: [] })).toBeNull();
  });

  it("keys pairs in ascending order", () => {
    expect(toSynergy(pairRows)!.get("3:7")).toEqual({ games: 12, wins: 8 });
  });
});

describe("tournament data caching", () => {
  const base = { baseUrl: "https://example.test/api" };

  it("uses fresh cache without calling upstream", async () => {
    const { gateway, getJson } = gatewayFor(byQuery);
    const { cache } = memoryCache({ "pro-pairs-v1": { body: pairRows, ageMs: HOUR } });
    const insights = new OpenDotaDraftInsights(gateway, { ...base, cache, now: () => 0 });
    expect((await insights.synergy())?.size).toBe(1);
    expect(getJson).not.toHaveBeenCalled();
  });

  it("serves stale cache at once and refreshes it in the background", async () => {
    const { gateway, getJson } = gatewayFor(byQuery);
    const stale = { rows: [{ h1: 1, h2: 2, games: 9, wins: 1 }] };
    const { cache, store } = memoryCache({ "pro-pairs-v1": { body: stale, ageMs: 13 * HOUR } });
    const insights = new OpenDotaDraftInsights(gateway, { ...base, cache, now: () => 0 });
    expect((await insights.synergy())?.get("1:2")).toEqual({ games: 9, wins: 1 });
    await vi.waitFor(() => expect(store.get("pro-pairs-v1")?.body).toBe(pairRows));
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it("goes without the data when a cold query exceeds the budget", async () => {
    const getJson = vi.fn(() => new Promise(() => {}));
    const gateway = { getJson } as unknown as ProviderGateway;
    const insights = new OpenDotaDraftInsights(gateway, { ...base, budgetMs: 10 });
    expect(await insights.proMeta()).toBeNull();
  });

  it("does not cache upstream failures", async () => {
    const { gateway } = gatewayFor(() => undefined);
    const { cache, store } = memoryCache();
    const insights = new OpenDotaDraftInsights(gateway, { ...base, cache, now: () => 0 });
    expect(await insights.proMeta()).toBeNull();
    expect(store.size).toBe(0);
  });

  it("warms every query into the cache", async () => {
    const { gateway } = gatewayFor(byQuery);
    const { cache, store } = memoryCache();
    const insights = new OpenDotaDraftInsights(gateway, { ...base, cache, now: () => 0 });
    const res = await insights.warm();
    expect(res.every((r) => r.ok)).toBe(true);
    expect([...store.keys()].sort()).toEqual([
      "pro-heroes-v1",
      "pro-lanes-v1",
      "pro-leagues-v1",
      "pro-pairs-v1",
      "pro-positions-v1",
    ]);
  });
});
