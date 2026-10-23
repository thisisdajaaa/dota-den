import type { CoachFactSheet } from "@/modules/matches/domain/coach-facts";
import type { MatchDetail, MatchPlayer } from "@/modules/matches/domain/match-detail";
import type { Laning } from "@/modules/matches/domain/match-laning";
import type { ItemInfo } from "@/modules/matches/domain/read-models";

/** Synthetic match data for the AI coach's tests (no real players). */

export const laning = (over: Partial<Laning> = {}): Laning => ({
  lane: 1,
  laneRole: 1,
  roaming: false,
  efficiencyPct: 74.4,
  lastHitsAt10: 50,
  deniesAt10: 5,
  goldAt10: 3_800,
  observers: 2,
  sentries: 1,
  campsStacked: 1,
  stunsSec: 12.46,
  teamfight: 0.6,
  purchases: [
    { time: -80, key: "tango" },
    { time: 600, key: "power_treads" },
    { time: 1100, key: "bfury" },
    { time: 1500, key: "recipe_manta" },
  ],
  ...over,
});

export function player(playerSlot: number, over: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    playerSlot,
    side: playerSlot < 128 ? "radiant" : "dire",
    accountId32: 90_000 + playerSlot,
    personaName: `Fixture ${playerSlot}`,
    heroId: 100 + playerSlot,
    level: 20,
    kills: 5,
    deaths: 5,
    assists: 5,
    lastHits: 150,
    denies: 10,
    goldPerMin: 500,
    xpPerMin: 600,
    netWorth: 15_000,
    heroDamage: 20_000,
    towerDamage: 1_000,
    heroHealing: 0,
    items: [null, null, null, null, null, null],
    backpack: [null, null, null],
    neutralItem: null,
    hasScepter: false,
    hasShard: false,
    partyId: null,
    partySize: 1,
    rankTier: null,
    benchmarks: null,
    laning: null,
    map: null,
    ...over,
  };
}

export const ME = 22_202;

/** A parsed match: you (slot 0, Anti-Mage, safe lane) against two lane opponents. */
export function parsedMatch(
  over: { me?: Partial<MatchPlayer>; parsed?: boolean } = {},
): MatchDetail {
  const me = player(0, {
    accountId32: ME,
    heroId: 1,
    kills: 9,
    deaths: 3,
    assists: 7,
    goldPerMin: 640,
    partySize: null,
    laning: laning(),
    benchmarks: {
      gold_per_min: { raw: 640, pct: 0.81, pctBracket: 0.7 },
      last_hits_per_min: { raw: 7.9, pct: 0.924, pctBracket: null },
      hero_healing_per_min: { raw: 0, pct: 0.1, pctBracket: null },
    },
    map: {
      wards: [],
      teamfightDeaths: [
        { time: 400, x: 100, y: 100 },
        { time: 1500, x: 140, y: 135 },
        { time: 1500, x: 140, y: 135 },
      ],
    },
    ...over.me,
  });
  const others = [1, 2, 3, 4, 128, 129, 130, 131, 132].map((slot) =>
    player(slot, {
      laning: laning({
        lane: { 1: 2, 2: 3, 3: 1, 4: 3, 128: 3, 129: 2, 130: 1, 131: 3, 132: 1 }[slot],
        lastHitsAt10: 40,
        goldAt10: 3_300,
        purchases: [],
      }),
    }),
  );
  return {
    matchId: "7000000012",
    startedAt: new Date("2026-10-01T12:00:00Z"),
    durationSec: 2400,
    radiantWin: true,
    radiantScore: 30,
    direScore: 20,
    gameMode: 22,
    lobbyType: 7,
    region: 3,
    firstBloodSec: 90,
    parsed: over.parsed ?? true,
    goldAdvantage: null,
    xpAdvantage: null,
    players: [me, ...others],
    fetchedAt: new Date("2026-10-01T13:00:00Z"),
  };
}

export const ITEMS: ItemInfo[] = [
  { id: 44, key: "tango", name: "Tango", imageUrl: null, qual: "consumable", cost: 90 },
  { id: 63, key: "power_treads", name: "Power Treads", imageUrl: null, qual: "common", cost: 1400 },
  { id: 145, key: "bfury", name: "Battle Fury", imageUrl: null, qual: "epic", cost: 4100 },
  { id: 999, key: "recipe_manta", name: "Recipe", imageUrl: null, qual: null, cost: 1500 },
];

export const itemsByKey = new Map(ITEMS.map((i) => [i.key, i]));
export const heroName = (id: number) => (id === 1 ? "Anti-Mage" : `Hero ${id}`);

/** A small sheet for prompt and grounding tests. */
export const SHEET: CoachFactSheet = {
  matchId: "1",
  heroId: 1,
  heroName: "Anti-Mage",
  facts: [
    { key: "deaths", base: "deaths", subject: null, value: 7, unit: "count" },
    { key: "lastHitsAt10", base: "lastHitsAt10", subject: null, value: 48, unit: "count" },
    { key: "goldAt10", base: "goldAt10", subject: null, value: 3_812, unit: "number" },
    { key: "item.bfury", base: "itemTiming", subject: "Battle Fury", value: 1_103, unit: "clock" },
    { key: "laneEfficiency", base: "laneEfficiency", subject: null, value: 74, unit: "percent" },
    { key: "kda", base: "kda", subject: null, value: 5.3, unit: "ratio" },
    { key: "party", base: "party", subject: null, value: "unknown", unit: "text" },
  ],
  missing: ["party", "benchmarks"],
};
