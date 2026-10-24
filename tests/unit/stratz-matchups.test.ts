import { describe, expect, it, vi } from "vitest";
import { ProviderGateway } from "@/common/providers/provider-gateway";
import {
  chunkOf,
  MATCHUP_CHUNKS,
  MATCHUP_RETRY_AFTER_FAILURE_MS,
  MATCHUP_TTL_MS,
  MATCHUPS_QUERY,
  parseMatchups,
  StratzHeroMatchups,
  weekFor,
} from "@/common/providers/stratz-hero-matchups";
import { StratzDraftInsights } from "@/modules/drafts/infrastructure/stratz-draft-insights";
import type { OpenDotaDraftInsights } from "@/modules/drafts/infrastructure/opendota-draft-insights";
import { StratzGuideSource } from "@/modules/guides/infrastructure/stratz-guide-source";
import type { GuideSource } from "@/modules/guides/guides.ports";

type Pair = { heroId2: number; matchCount: number; winCount: number };

/** A hero's row: `vs` against heroes 2–6 (one fifth of its games each), `with` one teammate. */
function hero(heroId: number, games: number, rate: number) {
  const vs: Pair[] = [2, 3, 4, 5, 6].map((id) => ({
    heroId2: id,
    matchCount: games,
    winCount: Math.round(games * rate),
  }));
  return { heroId, vs, with: [{ heroId2: 7, matchCount: 40, winCount: 25 }] };
}

const body = (heroes: unknown[]) => ({ data: { heroStats: { matchUp: heroes } } });

/** A STRATZ answer for whichever chunk was asked for: every requested id is a hero. */
function chunkBody(init: RequestInit) {
  const { variables } = JSON.parse(String(init.body)) as { variables: { heroIds: number[] } };
  return body(variables.heroIds.map((id) => hero(id, 1000, 0.52)));
}

function source(handler: (init: RequestInit) => { status?: number; body: unknown }) {
  let now = Date.UTC(2026, 9, 24);
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const r = handler(init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  const gateway = new ProviderGateway({
    name: "stratz",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
    now: () => now,
  });
  const matchups = new StratzHeroMatchups(
    gateway,
    { baseUrl: "https://stratz.test/", token: "test-token" },
    () => now,
  );
  return { matchups, fetch, advance: (ms: number) => (now += ms) };
}

describe("parseMatchups", () => {
  it("counts each game once (five opponents per game) and keeps the owner's wins", () => {
    const m = parseMatchups(body([hero(74, 200, 0.6)]));
    const invoker = m?.get(74);
    expect(invoker).toMatchObject({ heroId: 74, games: 200, wins: 120 });
    expect(invoker?.vs.get(3)).toEqual({ games: 200, wins: 120 });
    expect(invoker?.with.get(7)).toEqual({ games: 40, wins: 25 });
  });

  it("leaves out ids without games, and rejects errors or impossible rows", () => {
    expect(parseMatchups(body([{ heroId: 24, vs: [], with: [] }]))?.size).toBe(0);
    expect(parseMatchups({ ...body([hero(1, 10, 0.5)]), errors: [{ message: "x" }] })).toBeNull();
    const bad = hero(1, 10, 0.5);
    bad.vs[0].winCount = 11;
    expect(parseMatchups(body([bad]))).toBeNull();
    expect(parseMatchups({ data: null })).toBeNull();
  });
});

describe("StratzHeroMatchups", () => {
  it("asks for the hero's chunk of 40 with the token, and caches it", async () => {
    const { matchups, fetch } = source((init) => ({ body: chunkBody(init) }));
    expect((await matchups.forHero(74))?.games).toBe(1000);
    expect((await matchups.forHero(41))?.heroId).toBe(41);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://stratz.test/graphql");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-token",
      "user-agent": "STRATZ_API",
    });
    const sent = JSON.parse(String(init.body));
    expect(sent.query).toBe(MATCHUPS_QUERY);
    expect(sent.variables.heroIds[0]).toBe(41);
    expect(sent.variables.heroIds).toHaveLength(40);
    expect(sent.variables.brackets).toEqual(["LEGEND_ANCIENT", "DIVINE_IMMORTAL"]);
    // A day in last week (midnight UTC): STRATZ answers with that whole, finished week.
    expect(sent.variables.week).toBe(Date.UTC(2026, 9, 17) / 1000);
    expect(weekFor(Date.UTC(2026, 9, 24, 15), 2)).toBe(Date.UTC(2026, 9, 10) / 1000);
    expect(chunkOf(40)).toBe(0);
    expect(chunkOf(41)).toBe(1);
  });

  it("returns every hero only when every chunk answered", async () => {
    const { matchups, fetch } = source((init) => ({ body: chunkBody(init) }));
    expect((await matchups.all())?.size).toBe(MATCHUP_CHUNKS * 40);
    expect(fetch).toHaveBeenCalledTimes(MATCHUP_CHUNKS);

    let calls = 0;
    const flaky = source((init) =>
      ++calls === 2 ? { status: 503, body: {} } : { body: chunkBody(init) },
    );
    expect(await flaky.matchups.all()).toBeNull();
  });

  it("keeps the last copy when a refresh fails, and waits before asking again", async () => {
    let fail = false;
    const { matchups, fetch, advance } = source((init) =>
      fail ? { status: 503, body: {} } : { body: chunkBody(init) },
    );
    await matchups.forHero(1);
    fail = true;
    // Past the memo and the gateway's stale window: only the parsed copy is left.
    advance(3 * MATCHUP_TTL_MS);
    expect((await matchups.forHero(1))?.games).toBe(1000);
    const after = fetch.mock.calls.length;
    await matchups.forHero(1);
    expect(fetch.mock.calls.length).toBe(after);
    advance(MATCHUP_RETRY_AFTER_FAILURE_MS);
    await matchups.forHero(1);
    expect(fetch.mock.calls.length).toBe(after + 1);
  });

  it("is null without data, and for ids that aren't heroes", async () => {
    const { matchups } = source(() => ({ status: 503, body: {} }));
    expect(await matchups.forHero(1)).toBeNull();
    expect(await matchups.forHero(0)).toBeNull();
  });
});

describe("STRATZ with an OpenDota fallback", () => {
  const openDotaTable = new Map([[2, { games: 30, wins: 10 }]]);
  const fallback = {
    heroMeta: vi.fn(async () => new Map([[1, { games: 5, wins: 3 }]])),
    matchups: vi.fn(async () => openDotaTable),
    proMeta: vi.fn(async () => null),
    synergy: vi.fn(async () => null),
    positions: vi.fn(async () => null),
    lanes: vi.fn(async () => null),
    warm: vi.fn(async () => [{ key: "pro-heroes-v1", ok: true }]),
  } as unknown as OpenDotaDraftInsights;

  it("drafts: win rates and matchups from STRATZ, tournament data from OpenDota", async () => {
    const { matchups } = source((init) => ({ body: chunkBody(init) }));
    const insights = new StratzDraftInsights(matchups, fallback);
    expect((await insights.heroMeta()).get(74)).toEqual({ games: 1000, wins: 520 });
    expect((await insights.matchups(74))?.get(3)).toEqual({ games: 1000, wins: 520 });
    await insights.synergy();
    expect(fallback.synergy).toHaveBeenCalled();
    expect(await insights.warm()).toEqual([
      { key: "pro-heroes-v1", ok: true },
      { key: "stratz-matchups", ok: true },
    ]);
  });

  it("drafts: OpenDota answers when STRATZ can't", async () => {
    const { matchups } = source(() => ({ status: 503, body: {} }));
    const insights = new StratzDraftInsights(matchups, fallback);
    expect((await insights.heroMeta()).get(1)).toEqual({ games: 5, wins: 3 });
    expect(await insights.matchups(74)).toBe(openDotaTable);
  });

  it("guides: says which games the matchups are from", async () => {
    const guideFallback = {
      matchups: vi.fn(async () => ({ rows: [{ heroId: 2, games: 30, wins: 10 }], source: "pro" })),
    } as unknown as GuideSource;
    const up = new StratzGuideSource(
      source((init) => ({ body: chunkBody(init) })).matchups,
      guideFallback,
    );
    const res = await up.matchups(74);
    expect(res?.source).toBe("pubs");
    expect(res?.rows).toContainEqual({ heroId: 3, games: 1000, wins: 520 });
    const down = new StratzGuideSource(
      source(() => ({ status: 503, body: {} })).matchups,
      guideFallback,
    );
    expect((await down.matchups(74))?.source).toBe("pro");
  });
});
