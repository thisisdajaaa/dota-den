import { describe, expect, it } from "vitest";
import {
  lineupNeeds,
  rankCandidates,
  type MatchupTable,
  type ScoringHero,
} from "@/modules/drafts/domain/draft-scoring";

const core = (id: number): ScoringHero => ({ id, name: `Core ${id}`, roles: ["Carry", "Nuker"] });
const flex = (id: number): ScoringHero => ({ id, name: `Flex ${id}`, roles: ["Carry", "Support"] });
const sup = (id: number): ScoringHero => ({
  id,
  name: `Support ${id}`,
  roles: ["Support", "Disabler"],
});

const noData = { meta: new Map(), matchups: new Map() };

describe("lineupNeeds", () => {
  it("forces supports once three cores are drafted", () => {
    expect(lineupNeeds([core(1), core(2), core(3)], 2)).toMatchObject({
      cores: 3,
      mustPickSupport: true,
    });
  });

  it("forces a support when the remaining picks are all needed for supports", () => {
    expect(lineupNeeds([core(1), core(2), sup(3)], 1).mustPickSupport).toBe(true);
    expect(lineupNeeds([core(1)], 4).mustPickSupport).toBe(false);
  });

  it("forces a core when both support slots are filled", () => {
    expect(lineupNeeds([sup(1), sup(2)], 3)).toMatchObject({
      mustPickCore: true,
      mustPickSupport: false,
    });
  });
});

describe("rankCandidates", () => {
  it("never offers a 4th core (the Luna/Jugg/SF problem)", () => {
    const ranked = rankCandidates({
      action: "pick",
      available: [core(10), core(11), sup(12), flex(13)],
      own: [core(1), core(2), core(3)],
      enemy: [],
      ownPicksLeft: 2,
      enemyPicksLeft: 5,
      ...noData,
    });
    expect(ranked.map((c) => c.heroId).sort()).toEqual([12, 13]);
  });

  it("prefers heroes with a better high-rank win rate, damped on small samples", () => {
    const meta = new Map([
      [10, { games: 50_000, wins: 27_000 }], // 54% on a big sample
      [11, { games: 20, wins: 18 }], // 90% on a tiny sample
    ]);
    const ranked = rankCandidates({
      action: "pick",
      available: [core(10), core(11)],
      own: [],
      enemy: [],
      ownPicksLeft: 5,
      enemyPicksLeft: 5,
      meta,
      matchups: new Map(),
    });
    expect(ranked[0].heroId).toBe(10);
    expect(ranked[0].facts[0]).toContain("54.0% win rate");
  });

  it("uses head-to-head records against the opponent's picks", () => {
    // Enemy hero 1's table: it wins 30% vs hero 10 (so 10 counters it) and 70% vs hero 11.
    const enemyTable: MatchupTable = new Map([
      [10, { games: 200, wins: 60 }],
      [11, { games: 200, wins: 140 }],
    ]);
    const ranked = rankCandidates({
      action: "pick",
      available: [core(10), core(11)],
      own: [],
      enemy: [core(1)],
      ownPicksLeft: 5,
      enemyPicksLeft: 4,
      meta: new Map(),
      matchups: new Map([[1, enemyTable]]),
    });
    expect(ranked[0]).toMatchObject({ heroId: 10, matchupEdge: 20 });
    expect(ranked[0].facts.join(" ")).toContain("vs opponent's Core 1 +20.0%");
  });

  it("bans the hero that beats our picks, ignoring tiny matchup samples", () => {
    const ourTable: MatchupTable = new Map([
      [20, { games: 300, wins: 90 }], // we win 30% vs 20: ban it
      [21, { games: 10, wins: 0 }], // too few games to trust
    ]);
    const ranked = rankCandidates({
      action: "ban",
      available: [core(20), core(21)],
      own: [core(1)],
      enemy: [],
      ownPicksLeft: 4,
      enemyPicksLeft: 5,
      meta: new Map(),
      matchups: new Map([[1, ourTable]]),
    });
    expect(ranked[0].heroId).toBe(20);
    expect(ranked.find((c) => c.heroId === 21)?.matchupEdge).toBeNull();
  });
});
