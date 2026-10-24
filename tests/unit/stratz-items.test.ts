import { describe, expect, it, vi } from "vitest";
import { ProviderGateway } from "@/common/providers/provider-gateway";
import { ITEMS_QUERY, parseItems, StratzHeroItems } from "@/common/providers/stratz-hero-items";
import {
  isBuildFiller,
  playedPositions,
  pubPhases,
  type PubBuild,
} from "@/modules/guides/domain/hero-guide";
import { GuideService } from "@/modules/guides/guides.service";
import type { GuideSource } from "@/modules/guides/guides.ports";

/** A STRATZ answer: Pos 1 is the hero's main position, Pos 2 a rare one. */
function body() {
  const minutes = (itemId: number, from: number, to: number, perMinute: number, rate = 0.5) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      itemId,
      instance: 0,
      time: from + i,
      matchCount: perMinute,
      winCount: Math.round(perMinute * rate),
    }));
  const empty = { full: [], start: [] };
  const pos = {
    1: {
      full: [
        ...minutes(36, 1, 3, 100), // Magic Wand: early
        ...minutes(1, 12, 16, 200, 0.55), // Blink: mid
        ...minutes(116, 24, 30, 50, 0.6), // BKB: late (median 27)
        { itemId: 36, instance: 1, time: 20, matchCount: 999, winCount: 1 }, // second copy
        ...minutes(29, 2, 2, 5), // rare
      ],
      start: [
        { itemId: 44, instance: 0, wasGiven: false, matchCount: 900, winCount: 450 },
        { itemId: 44, instance: 1, wasGiven: true, matchCount: 300, winCount: 150 },
        { itemId: 16, instance: 0, wasGiven: true, matchCount: 800, winCount: 400 },
      ],
    },
    2: empty,
    3: empty,
    4: empty,
    5: empty,
  } as const;
  return {
    data: {
      heroStats: {
        positions: [
          { position: "POSITION_1", matchCount: 9_000, winCount: 4_700 },
          { position: "POSITION_2", matchCount: 600, winCount: 300 },
        ],
        ...Object.fromEntries(
          Object.entries(pos).flatMap(([p, v]) => [
            [`full${p}`, v.full],
            [`start${p}`, v.start],
          ]),
        ),
      },
    },
  };
}

describe("parseItems", () => {
  it("adds up minutes per item (first copy only), with the minute half were bought by", () => {
    const builds = parseItems(body())!;
    const pos1 = builds.find((b) => b.position === 1)!;
    expect(pos1).toMatchObject({ games: 9_000, wins: 4_700 });
    expect(pos1.items.find((i) => i.itemId === 36)).toEqual({
      itemId: 36,
      games: 300,
      wins: 150,
      minute: 2,
    });
    expect(pos1.items.find((i) => i.itemId === 116)?.minute).toBe(27);
    // Starting items the player bought themself; a teammate's handout doesn't count.
    expect(pos1.starting.map((i) => i.itemId)).toEqual([44]);
    expect(builds.find((b) => b.position === 3)).toMatchObject({ games: 0, items: [] });
  });

  it("rejects GraphQL errors and malformed rows", () => {
    expect(parseItems({ ...body(), errors: [{ message: "x" }] })).toBeNull();
    const bad = body();
    (bad.data.heroStats as Record<string, unknown>).full1 = [{ itemId: "x" }];
    expect(parseItems(bad)).toBeNull();
    expect(parseItems({ data: null })).toBeNull();
  });
});

describe("pub item builds", () => {
  const builds = parseItems(body()) as PubBuild[];

  it("offers only positions the hero is really played in", () => {
    // Pos 2 is 6% of the games and under 1,000: no tab.
    expect(playedPositions(builds)).toEqual([{ position: 1, games: 9_000, share: 9_000 / 9_600 }]);
  });

  it("sorts items into phases by their typical minute, leaving out rare and filler items", () => {
    const phases = pubPhases(
      builds.find((b) => b.position === 1)!,
      (id) => id === 99,
    );
    expect(phases.start.map((i) => i.itemId)).toEqual([44]);
    expect(phases.early).toEqual([
      { itemId: 36, count: 300, relative: 1, winRate: 0.5, minute: 2 },
    ]);
    expect(phases.mid.map((i) => i.itemId)).toEqual([1]);
    expect(phases.mid[0].winRate).toBeCloseTo(0.55, 2);
    expect(phases.late.map((i) => [i.itemId, i.minute])).toEqual([[116, 27]]);
    // 5 games of 9,000 is under the 2% floor.
    expect(
      Object.values(phases)
        .flat()
        .some((i) => i.itemId === 29),
    ).toBe(false);
    const noWand = pubPhases(
      builds.find((b) => b.position === 1)!,
      (id) => id === 36,
    );
    expect(noWand.early).toEqual([]);
  });

  it("treats consumables, secret-shop parts and cheap components as filler", () => {
    expect(isBuildFiller({ qual: "consumable", cost: 90 })).toBe(true);
    expect(isBuildFiller({ qual: "secret_shop", cost: 2800 })).toBe(true);
    expect(isBuildFiller({ qual: "component", cost: 1000 })).toBe(true);
    expect(isBuildFiller({ qual: "component", cost: 2250 })).toBe(false); // Blink Dagger
    expect(isBuildFiller({ qual: "epic", cost: 4050 })).toBe(false);
    expect(isBuildFiller(undefined)).toBe(false);
  });
});

describe("GuideService item builds", () => {
  const base = {
    benchmarks: async () => null,
    proGames: async () => null,
    proNames: async () => null,
    matchups: async () => null,
  };

  it("uses pub builds for the asked position, else the most played one", async () => {
    const itemPopularity = vi.fn(async () => null);
    const svc = new GuideService({
      source: { ...base, itemPopularity, itemBuilds: async () => parseItems(body()) },
    });
    const g = await svc.guide(1, () => false, { position: 2 });
    expect(g.itemSource).toMatchObject({ source: "pubs", position: 1 });
    expect(g.items?.mid.map((i) => i.itemId)).toEqual([1]);
    // No pro lookup when the pub build answered.
    expect(itemPopularity).not.toHaveBeenCalled();
  });

  it("falls back to pro games when STRATZ can't answer", async () => {
    const source: GuideSource = {
      ...base,
      itemBuilds: async () => null,
      itemPopularity: async () =>
        ({
          start_game_items: {},
          early_game_items: {},
          mid_game_items: { "1": 4 },
          late_game_items: {},
        }) as never,
    };
    const svc = new GuideService({ source });
    const g = await svc.guide(1, () => false);
    expect(g.itemSource).toEqual({ source: "pro" });
  });
});

describe("StratzHeroItems", () => {
  it("asks once per hero for every position, with the token, and caches it", async () => {
    const fetch = vi.fn(
      async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body())),
    );
    const now = Date.UTC(2026, 9, 24);
    const gateway = new ProviderGateway({
      name: "stratz",
      fetch,
      sleep: async () => {},
      maxRetries: 0,
      now: () => now,
    });
    const items = new StratzHeroItems(
      gateway,
      { baseUrl: "https://s.test", token: "t" },
      () => now,
    );
    expect((await items.forHero(74))?.length).toBe(5);
    await items.forHero(74);
    expect(fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(sent.query).toBe(ITEMS_QUERY);
    expect(sent.variables).toMatchObject({ heroId: 74, week: Date.UTC(2026, 9, 17) / 1000 });
    expect(fetch.mock.calls[0][1].headers).toMatchObject({
      authorization: "Bearer t",
      "user-agent": "STRATZ_API",
    });
    expect(await items.forHero(0)).toBeNull();
  });
});
