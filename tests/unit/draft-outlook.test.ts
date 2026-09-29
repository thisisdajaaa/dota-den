import { describe, expect, it } from "vitest";
import { draftOutlook } from "@/modules/drafts/domain/draft-outlook";
import {
  pairKey,
  rankCandidates,
  type HeroMeta,
  type MatchupTable,
  type ProMeta,
  type ScoringHero,
} from "@/modules/drafts/domain/draft-scoring";

const core = (id: number): ScoringHero => ({ id, name: `Core ${id}`, roles: ["Carry"] });
const sup = (id: number): ScoringHero => ({ id, name: `Support ${id}`, roles: ["Support"] });

const meta = (entries: Record<number, number>): Map<number, HeroMeta> =>
  new Map(
    Object.entries(entries).map(([id, rate]) => [
      Number(id),
      { games: 100_000, wins: Math.round(100_000 * rate) },
    ]),
  );

describe("draftOutlook", () => {
  it("has no estimate before anything is picked", () => {
    const res = draftOutlook({ radiant: [], dire: [], meta: new Map(), matchups: new Map() });
    expect(res.radiantPct).toBeNull();
    expect(res.confidence).toBe("low");
  });

  it("is 50% with no data at all, never inventing an edge", () => {
    const res = draftOutlook({
      radiant: [core(1)],
      dire: [core(2)],
      meta: new Map(),
      matchups: new Map(),
    });
    expect(res.radiantPct).toBe(50);
    expect(res.heroes.every((h) => h.winRate === null && h.contest === null)).toBe(true);
  });

  it("favours the side with stronger heroes this patch", () => {
    const res = draftOutlook({
      radiant: [core(1), core(2)],
      dire: [core(3), core(4)],
      meta: meta({ 1: 0.53, 2: 0.53, 3: 0.49, 4: 0.49 }),
      matchups: new Map(),
    });
    expect(res.radiantPct).toBeGreaterThan(50);
    expect(res.sides.radiant.meta).toBeGreaterThan(res.sides.dire.meta);
    expect(res.notes[0]).toContain("Radiant has the stronger heroes");
  });

  it("measures matchups against what the win rates predict, not against 50%", () => {
    // Hero 1 (55%) beats hero 2 (50%) 55% of the time: exactly as expected, so no edge.
    const table2: MatchupTable = new Map([[1, { games: 1_000, wins: 450 }]]);
    const res = draftOutlook({
      radiant: [core(1)],
      dire: [core(2)],
      meta: new Map([
        [1, { games: 10_000_000, wins: 5_500_000 }],
        [2, { games: 10_000_000, wins: 5_000_000 }],
      ]),
      matchups: new Map([[2, table2]]),
    });
    expect(Math.abs(res.sides.radiant.matchups)).toBeLessThan(0.1);
  });

  it("stays between 30% and 70% however lopsided the numbers", () => {
    const heroes = [1, 2, 3, 4, 5];
    const res = draftOutlook({
      radiant: heroes.map(core),
      dire: heroes.map((id) => core(id + 10)),
      meta: new Map<number, HeroMeta>([
        ...heroes.map((id): [number, HeroMeta] => [id, { games: 1_000_000, wins: 800_000 }]),
        ...heroes.map((id): [number, HeroMeta] => [id + 10, { games: 1_000_000, wins: 200_000 }]),
      ]),
      matchups: new Map(),
    });
    expect(res.radiantPct).toBe(70);
  });

  it("warns about a lineup with no supports and reports low confidence on thin data", () => {
    const res = draftOutlook({
      radiant: [core(1), core(2), core(3), core(4)],
      dire: [sup(5)],
      meta: new Map(),
      matchups: new Map(),
    });
    expect(res.sides.radiant.warnings[0]).toContain("4 cores");
    expect(res.notes.some((n) => n.startsWith("Radiant: 4 cores"))).toBe(true);
    expect(res.confidence).toBe("low");
  });

  it("reports tournament presence for picked heroes", () => {
    const pro: ProMeta = {
      matches: 100,
      days: 21,
      leagues: [{ name: "Fixture Major", matches: 100 }],
      heroes: new Map([[1, { picks: 40, bans: 30, wins: 25 }]]),
    };
    const res = draftOutlook({
      radiant: [core(1)],
      dire: [core(2)],
      meta: new Map(),
      matchups: new Map(),
      pro,
    });
    const hero = res.heroes.find((h) => h.heroId === 1)!;
    expect(hero).toMatchObject({ proPicks: 40, proBans: 30, contest: 0.7 });
    expect(res.heroes.find((h) => h.heroId === 2)).toMatchObject({ proPicks: 0, contest: 0 });
    expect(res.notes.join(" ")).toContain("Core 1 is a tournament priority");
  });
});

describe("rankCandidates with tournament data", () => {
  const pro: ProMeta = {
    matches: 200,
    days: 21,
    leagues: [
      { name: "Fixture Major", matches: 150 },
      { name: "Fixture Qualifier", matches: 50 },
    ],
    heroes: new Map([[11, { picks: 60, bans: 120, wins: 36 }]]),
  };

  it("bans what the pros fight over when nothing else separates the options", () => {
    const ranked = rankCandidates({
      action: "ban",
      available: [core(10), core(11)],
      own: [],
      enemy: [],
      ownPicksLeft: 5,
      enemyPicksLeft: 5,
      meta: new Map(),
      matchups: new Map(),
      pro,
    });
    expect(ranked[0].heroId).toBe(11);
    expect(ranked[0].contest).toBeCloseTo(0.9);
    expect(ranked[0].facts.join(" ")).toContain(
      "picked or banned in 90% of recent pro drafts (won 36 of 60)",
    );
  });

  it("prefers a hero that pairs well with our picks in pro games", () => {
    const synergy = new Map([
      [pairKey(1, 10), { games: 40, wins: 30 }],
      [pairKey(1, 12), { games: 40, wins: 12 }],
    ]);
    const ranked = rankCandidates({
      action: "pick",
      available: [core(10), core(12)],
      own: [sup(1)],
      enemy: [],
      ownPicksLeft: 4,
      enemyPicksLeft: 5,
      meta: new Map(),
      matchups: new Map(),
      synergy,
    });
    expect(ranked[0].heroId).toBe(10);
    expect(ranked[0].synergyEdge).toBeGreaterThan(0);
    expect(ranked[0].facts.join(" ")).toContain(
      "with our Support 1: 75% win rate together in 40 pro games",
    );
  });

  it("ignores pairs that rarely play together", () => {
    const ranked = rankCandidates({
      action: "pick",
      available: [core(10)],
      own: [sup(1)],
      enemy: [],
      ownPicksLeft: 4,
      enemyPicksLeft: 5,
      meta: new Map(),
      matchups: new Map(),
      synergy: new Map([[pairKey(1, 10), { games: 3, wins: 3 }]]),
    });
    expect(ranked[0].synergyEdge).toBeNull();
  });
});

describe("draftOutlook pairings", () => {
  it("caps the pairing term, since small pro samples overstate synergy", () => {
    const team = [1, 2, 3, 4, 5];
    const synergy = new Map<string, { games: number; wins: number }>();
    for (const a of team)
      for (const b of team) if (a < b) synergy.set(pairKey(a, b), { games: 200, wins: 190 });
    const res = draftOutlook({
      radiant: team.map(core),
      dire: [core(10)],
      meta: new Map(),
      matchups: new Map(),
      synergy,
    });
    expect(res.sides.radiant.synergy).toBe(4);
  });
});
