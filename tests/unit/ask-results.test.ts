import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import {
  mmrResult,
  recentGamesResult,
  wardSpotsResult,
} from "@/modules/assistant/domain/ask-results";
import { mergeSources } from "@/modules/assistant/domain/ask-sources";
import { findHero } from "@/modules/assistant/domain/hero-lookup";
import { wardArea } from "@/modules/assistant/domain/ward-areas";
import { AppAskData, type AskSources } from "@/modules/assistant/infrastructure/app-ask-data";
import type { DashboardFact } from "@/modules/matches/domain/read-models";

const HEROES = [
  { id: 1, name: "Anti-Mage" },
  { id: 14, name: "Pudge" },
  { id: 26, name: "Lion" },
  { id: 44, name: "Phantom Assassin" },
  { id: 12, name: "Phantom Lancer" },
];
const NOW = new Date("2026-11-18T12:00:00Z");
const day = (d: Date) => d.toISOString().slice(0, 10);

const fact = (i: number, over: Partial<DashboardFact> = {}): DashboardFact => ({
  matchId: String(8000 + i),
  startedAt: new Date(NOW.getTime() - i * 86_400_000),
  durationSec: 2100,
  heroId: 14,
  side: "radiant",
  result: i % 2 ? "loss" : "win",
  kills: 5,
  deaths: 7,
  assists: 9,
  ranked: true,
  queueClass: "unknown",
  partySize: null,
  patch: "7.39d",
  patchCertainty: "confident",
  ...over,
});

describe("hero names as players type them", () => {
  it("finds heroes by name, nickname or a unique prefix, never guessing", () => {
    expect(findHero("pudge", HEROES)?.id).toBe(14);
    expect(findHero("Anti Mage", HEROES)?.id).toBe(1);
    expect(findHero("AM", HEROES)?.id).toBe(1);
    expect(findHero("pa", HEROES)?.id).toBe(44);
    expect(findHero("anti", HEROES)?.id).toBe(1);
    // "Phantom" could be two heroes.
    expect(findHero("phantom", HEROES)).toBeNull();
    expect(findHero("Not a hero", HEROES)).toBeNull();
  });
});

describe("ward areas", () => {
  it("places spots by the river (top left to bottom right)", () => {
    expect(wardArea({ left: 0.1, top: 0.9 })).toEqual({ half: "radiant", area: "bottom_left" });
    expect(wardArea({ left: 0.85, top: 0.15 })).toEqual({ half: "dire", area: "top_right" });
    expect(wardArea({ left: 0.5, top: 0.52 })).toEqual({ half: "river", area: "middle" });
  });

  it("returns the top spots of the asked side and phase, from pro games", () => {
    const res = wardSpotsResult({
      data: {
        games: 40,
        cells: [
          { kind: "observer", side: "dire", phase: "mid", x: 120, y: 150, count: 9 },
          { kind: "observer", side: "radiant", phase: "mid", x: 100, y: 100, count: 30 },
        ],
      },
      side: "dire",
      phase: "mid",
      kind: "observer",
    });
    expect(res.data).toMatchObject({ fromProGames: 40, spots: [{ rank: 1, placements: 9 }] });
    expect(res.sources).toEqual([{ kind: "pro_games", games: 40 }]);
  });
});

describe("tool results", () => {
  it("keeps a missing party size as unknown, never solo", () => {
    const res = recentGamesResult({
      games: [fact(0), fact(1), fact(2)],
      heroName: (id) => HEROES.find((h) => h.id === id)?.name ?? "?",
      now: NOW,
      dayKey: day,
      totalImported: 3,
    });
    const data = res.data as {
      byParty: Record<string, { games: number }>;
      list: Array<{ party: string; length: string; daysAgo: number }>;
      winRatePct: number;
    };
    expect(data.byParty.solo.games).toBe(0);
    expect(data.byParty.unknown.games).toBe(3);
    expect(data.list[0]).toMatchObject({ party: "unknown", length: "35:00", daysAgo: 0 });
    expect(data.winRatePct).toBe(66.7);
    expect(res.sources).toEqual([{ kind: "your_games", games: 3 }]);
  });

  it("says when nothing is imported", () => {
    const res = recentGamesResult({
      games: [],
      heroName: () => "",
      now: NOW,
      dayKey: day,
      totalImported: 0,
    });
    expect(res.data).toMatchObject({ error: "no_games_imported" });
  });

  it("never invents an MMR: no entries means unknown", () => {
    const empty = mmrResult({ entries: [], rankTier: null, now: NOW, dayKey: day });
    expect(empty.data).toMatchObject({ rankMedal: "unknown", entriesLogged: 0 });
    expect(empty.data).not.toHaveProperty("latest");
    const logged = mmrResult({
      entries: [
        { observedAt: new Date("2026-11-01T00:00:00Z"), mmr: 2400 },
        { observedAt: new Date("2026-11-17T00:00:00Z"), mmr: 2475 },
      ],
      rankTier: 34,
      now: NOW,
      dayKey: day,
    });
    expect(logged.data).toMatchObject({
      rankMedal: "Crusader 4",
      latest: { mmr: 2475 },
      changeLast30Days: 75,
    });
  });

  it("merges source chips", () => {
    expect(
      mergeSources([
        { kind: "your_games", games: 5 },
        { kind: "your_games", games: 20 },
        { kind: "high_rank_pubs" },
        { kind: "high_rank_pubs" },
      ]),
    ).toEqual([{ kind: "your_games", games: 20 }, { kind: "high_rank_pubs" }]);
  });
});

describe("AppAskData scoping", () => {
  const sources = (over: Partial<AskSources> = {}): AskSources =>
    ({
      heroes: async () => HEROES,
      items: async () => new Map(),
      games: vi.fn(async () => [fact(0)]),
      factSheet: vi.fn(async () => err({ type: "not_yours" })),
      now: () => NOW,
      ...over,
    }) as unknown as AskSources;

  it("reads only the owner's games and refuses matches they weren't in", async () => {
    const src = sources();
    const data = new AppAskData(src);
    const res = await data.matchSummary({ userId: "u1", accountId32: 111 }, { match_id: "999" });
    expect(src.factSheet).toHaveBeenCalledWith(111, "999");
    expect(res.data).toMatchObject({ error: "not_your_match" });
  });

  it("defaults to the owner's newest game", async () => {
    const src = sources({
      factSheet: vi.fn(async () =>
        ok({
          matchId: "8000",
          heroId: 14,
          heroName: "Pudge",
          facts: [],
          missing: ["party" as const],
        }),
      ),
    });
    const res = await new AppAskData(src).matchSummary({ userId: "u1", accountId32: 111 }, {});
    expect(src.games).toHaveBeenCalledWith(111);
    expect(src.factSheet).toHaveBeenCalledWith(111, "8000");
    expect(res.sources).toEqual([{ kind: "your_match", matchId: "8000" }]);
  });

  it("asks which hero when the name is unknown", async () => {
    const res = await new AppAskData(sources()).heroStats(
      { userId: "u1", accountId32: 111 },
      { hero: "Pudgee" },
    );
    expect(res.data).toMatchObject({ error: "unknown_hero" });
  });
});
