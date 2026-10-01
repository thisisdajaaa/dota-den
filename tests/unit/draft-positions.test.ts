import { describe, expect, it } from "vitest";
import { draftOutlook } from "@/modules/drafts/domain/draft-outlook";
import {
  assignPositions,
  candidatePosition,
  positionFact,
  positionOdds,
  type PositionCounts,
  type PositionTable,
} from "@/modules/drafts/domain/draft-positions";
import { rankCandidates, type ScoringHero } from "@/modules/drafts/domain/draft-scoring";

const counts = (c: [number, number, number, number, number]): PositionCounts => ({
  counts: c,
  games: c.reduce((a, b) => a + b, 0),
});

// Synthetic heroes with pro position records.
const H = {
  carry: { id: 1, name: "Carry A", roles: ["Carry"] },
  carry2: { id: 2, name: "Carry B", roles: ["Carry"] },
  mid: { id: 3, name: "Mid A", roles: ["Nuker"] },
  off: { id: 4, name: "Off A", roles: ["Initiator", "Durable"] },
  soft: { id: 5, name: "Soft A", roles: ["Support", "Nuker"] },
  hard: { id: 6, name: "Hard A", roles: ["Support"] },
  flex: { id: 7, name: "Flex A", roles: ["Support", "Initiator"] },
  rare: { id: 8, name: "Rare A", roles: ["Support"] },
} satisfies Record<string, ScoringHero>;

const table: PositionTable = new Map([
  [1, counts([200, 10, 0, 0, 0])],
  [2, counts([150, 20, 5, 0, 0])],
  [3, counts([2, 180, 5, 3, 0])],
  [4, counts([0, 5, 160, 10, 0])],
  [5, counts([0, 0, 0, 120, 30])],
  [6, counts([0, 0, 0, 20, 140])],
  [7, counts([0, 0, 60, 60, 20])],
  [8, counts([0, 0, 0, 1, 2])],
]);

describe("positionOdds", () => {
  it("uses pro games, blended with a small role-tag prior", () => {
    const odds = positionOdds(H.mid, table);
    expect(odds.source).toBe("pro");
    expect(odds.odds[1]).toBeGreaterThan(0.85);
    expect(odds.odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(odds.proShare?.[1]).toBeCloseTo(180 / 190);
  });

  it("falls back to role tags when the pros rarely play the hero", () => {
    const odds = positionOdds(H.rare, table);
    expect(odds.source).toBe("tags");
    expect(odds.odds[4] + odds.odds[3]).toBeGreaterThan(0.6);
    expect(positionOdds({ id: 99, roles: ["Carry"] }, table)).toMatchObject({
      source: "tags",
      games: 0,
    });
  });

  it("describes where the pros play it, or that it's a role-tag guess", () => {
    expect(positionFact(2, positionOdds(H.mid, table))).toBe(
      "would play Mid: played there in 95% of 190 pro games",
    );
    expect(positionFact(5, positionOdds(H.rare, table))).toContain("from hero role tags");
  });
});

describe("assignPositions", () => {
  it("gives each hero its most likely distinct position", () => {
    const a = assignPositions([H.hard, H.off, H.carry, H.mid, H.soft], table);
    expect(Object.fromEntries(a.heroes.map((h) => [h.heroId, h.position]))).toEqual({
      6: 5,
      4: 3,
      1: 1,
      3: 2,
      5: 4,
    });
    expect(a.open).toEqual([]);
  });

  it("moves a flexible hero so everyone fits", () => {
    // Flex plays offlane or soft support; with an offlaner already, it goes to pos 4.
    const a = assignPositions([H.off, H.flex], table);
    expect(a.heroes.find((h) => h.heroId === 7)?.position).toBe(4);
    expect(a.open).toEqual([1, 2, 5]);
  });

  it("forces the second carry off its role, with a low fit", () => {
    const a = assignPositions([H.carry, H.carry2], table);
    const second = a.heroes.find((h) => h.position !== 1)!;
    expect(second.fit).toBeLessThan(0.15);
  });
});

describe("candidatePosition", () => {
  it("scores how naturally a hero fills an open slot", () => {
    const team = [H.carry, H.mid, H.off];
    const soft = candidatePosition(H.soft, team, table)!;
    expect(soft.position).toBe(4);
    expect(soft.lineupFit).toBeGreaterThan(0.6);
    const carry = candidatePosition(H.carry2, team, table)!;
    expect(carry.lineupFit).toBeLessThan(0.12);
  });

  it("is null for a full lineup", () => {
    expect(candidatePosition(H.hard, [H.carry, H.mid, H.off, H.soft, H.flex], table)).toBeNull();
  });
});

describe("rankCandidates with positions", () => {
  const base = {
    action: "pick" as const,
    enemy: [],
    ownPicksLeft: 2,
    enemyPicksLeft: 5,
    meta: new Map(),
    matchups: new Map(),
    positions: table,
  };

  it("only offers heroes for the open positions, and says which", () => {
    const ranked = rankCandidates({
      ...base,
      available: [H.carry2, H.soft, H.hard],
      own: [H.carry, H.mid, H.off],
    });
    expect(ranked.map((c) => c.heroId).sort()).toEqual([5, 6]);
    expect(ranked.find((c) => c.heroId === 5)).toMatchObject({ position: 4, role: "support" });
    expect(ranked.find((c) => c.heroId === 6)?.facts.join(" ")).toContain(
      "would play Hard support: played there in 88% of 160 pro games",
    );
  });

  it("bans heroes that fill the opponent's open positions", () => {
    const ranked = rankCandidates({
      ...base,
      action: "ban",
      available: [H.carry2, H.hard],
      own: [],
      enemy: [H.carry, H.mid, H.off, H.soft],
      enemyPicksLeft: 1,
    });
    expect(ranked[0].heroId).toBe(6);
    expect(ranked[0].facts.join(" ")).toContain("would fill their Hard support");
  });
});

describe("candidatePosition with hand-set positions", () => {
  it("treats a position you assigned by hand as taken", () => {
    // Off A is a natural offlaner; with Flex A put at offlane by hand, it must go elsewhere.
    expect(candidatePosition(H.off, [H.flex], table)?.position).toBe(3);
    expect(candidatePosition(H.off, [H.flex], table, new Map([[H.flex.id, 3]]))?.position).not.toBe(
      3,
    );
  });
});

describe("draftOutlook with positions", () => {
  it("lays out lineups by position, lane by lane, and warns about off-role heroes", () => {
    const res = draftOutlook({
      radiant: [H.carry, H.hard, H.mid],
      dire: [H.off, H.soft, H.carry2, H.flex],
      meta: new Map(),
      matchups: new Map([
        // Dire's Off A: Carry A wins 60% against it (safe lane vs offlane).
        [4, new Map([[1, { games: 1_000, wins: 400 }]])],
      ]),
      positions: table,
    });
    expect(res.positionsFrom).toBe("pro");
    expect(res.heroes.find((h) => h.heroId === 1)).toMatchObject({ position: 1, role: "core" });
    expect(res.sides.radiant.open).toEqual([3, 4]);
    const safe = res.lanes.find((l) => l.lane === "radiant_safe")!;
    expect(safe.radiant.sort()).toEqual([1, 6]);
    expect(safe.edge).toBeGreaterThan(0);
    expect(res.notes.join(" ")).toContain("favours Radiant");
    expect(res.lanes.map((l) => l.lane)).not.toContain("mid");
  });

  it("re-scores when you move heroes to other positions", () => {
    const input = {
      radiant: [H.carry, H.mid, H.off, H.soft, H.hard],
      dire: [H.carry2, H.flex, H.rare, H.soft, H.hard].map((h, i) => ({ ...h, id: 20 + i })),
      meta: new Map(),
      matchups: new Map(),
      positions: table,
      picksPerSide: 5,
    };
    const natural = draftOutlook(input);
    // Swap the carry and the hard support: both now play far from where pros play them.
    const swapped = draftOutlook({
      ...input,
      fixed: {
        radiant: new Map([
          [H.carry.id, 5],
          [H.hard.id, 1],
        ]),
      },
    });
    const pos = (o: typeof natural, id: number) => o.heroes.find((h) => h.heroId === id)?.position;
    expect(pos(swapped, H.carry.id)).toBe(5);
    expect(pos(swapped, H.hard.id)).toBe(1);
    const grade = (o: typeof natural) =>
      o.report.radiant.criteria.find((c) => c.key === "positions")?.score ?? null;
    expect(grade(swapped)).not.toBeNull();
    expect(grade(swapped)!).toBeLessThan(grade(natural)!);
    expect(swapped.report.radiant.overall!).toBeLessThan(natural.report.radiant.overall!);
  });

  it("uses role tags when pro positions are unavailable", () => {
    const res = draftOutlook({
      radiant: [H.carry],
      dire: [H.hard],
      meta: new Map(),
      matchups: new Map(),
    });
    expect(res.positionsFrom).toBe("tags");
    expect(res.heroes.every((h) => h.positionShare === null)).toBe(true);
  });
});
