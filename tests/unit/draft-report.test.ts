import { describe, expect, it } from "vitest";
import { laneKey, laneRecord, opposingPositions } from "@/modules/drafts/domain/draft-lanes";
import { draftOutlook } from "@/modules/drafts/domain/draft-outlook";
import { assignPositions, type PositionTable } from "@/modules/drafts/domain/draft-positions";
import {
  compositionChecks,
  draftReport,
  gradeOf,
  sideReport,
  type SideEvidence,
} from "@/modules/drafts/domain/draft-report";
import { rankCandidates, type ScoringHero } from "@/modules/drafts/domain/draft-scoring";

const counts = (c: [number, number, number, number, number]) => ({
  counts: c,
  games: c.reduce((a, b) => a + b, 0),
});
const table: PositionTable = new Map([
  [1, counts([200, 0, 0, 0, 0])],
  [2, counts([0, 200, 0, 0, 0])],
  [3, counts([0, 0, 200, 0, 0])],
  [4, counts([0, 0, 0, 200, 0])],
  [5, counts([0, 0, 0, 0, 200])],
  [11, counts([200, 0, 0, 0, 0])],
  [12, counts([0, 200, 0, 0, 0])],
  [13, counts([0, 0, 200, 0, 0])],
  [14, counts([0, 0, 0, 200, 0])],
  [15, counts([0, 0, 0, 0, 200])],
  [16, counts([0, 0, 180, 20, 0])],
]);
const hero = (id: number, roles: string[] = []): ScoringHero => ({ id, name: `Hero ${id}`, roles });

const evidence = (over: Partial<SideEvidence> = {}): SideEvidence => ({
  heroes: 5,
  laneEdge: null,
  lanesWithData: 0,
  proLanes: 0,
  counterEdge: null,
  strengthEdge: null,
  positionFit: null,
  offRole: [],
  comboEdge: null,
  comboPairs: 0,
  composition: compositionChecks([], null),
  ...over,
});

describe("laneRecord", () => {
  const lanes = new Map([[laneKey(1, 13), { games: 20, wins: 15 }]]);

  it("reads either direction and damps small samples", () => {
    const a = laneRecord(1, 13, lanes)!;
    const b = laneRecord(13, 1, lanes)!;
    expect(a).toMatchObject({ games: 20, wins: 15 });
    expect(b).toMatchObject({ games: 20, wins: 5 });
    expect(a.edge).toBeCloseTo(((15 - 10) / 30) * 100);
    expect(b.edge).toBeCloseTo(-a.edge);
    expect(laneRecord(1, 13, new Map([[laneKey(1, 13), { games: 3, wins: 3 }]]))).toBeNull();
  });

  it("knows who lanes against whom", () => {
    expect(opposingPositions(1)).toEqual([3, 4]);
    expect(opposingPositions(2)).toEqual([2]);
    expect(opposingPositions(4)).toEqual([1, 5]);
  });
});

describe("report card", () => {
  it("grades each criterion around 50 = average and weights the overall", () => {
    const r = sideReport(
      evidence({ laneEdge: 5, lanesWithData: 2, counterEdge: 0, strengthEdge: -2 }),
    );
    const by = Object.fromEntries(r.criteria.map((c) => [c.key, c]));
    expect(by.lanes.score).toBe(70);
    expect(by.counters.score).toBe(50);
    expect(by.strength.score).toBe(34);
    expect(by.combos).toMatchObject({ score: null, grade: null });
    expect(r.overall).not.toBeNull();
    expect(gradeOf(75)).toBe("A");
    expect(gradeOf(37)).toBe("F");
  });

  it("scores composition from role tags and says what's missing", () => {
    const checks = compositionChecks(
      [
        { name: "Axe", roles: ["Initiator", "Durable", "Disabler"] },
        { name: "Lion", roles: ["Support", "Disabler", "Nuker"] },
      ],
      null,
    );
    expect(checks.find((c) => c.label === "Control")?.passed).toBe(true);
    expect(checks.find((c) => c.label === "Late game")?.passed).toBe(false);
    const r = sideReport(evidence({ composition: checks }));
    expect(r.criteria.find((c) => c.key === "composition")?.summary).toContain("late game");
  });

  it("names the criteria that decide the draft", () => {
    const rep = draftReport(
      evidence({ laneEdge: 6, lanesWithData: 3 }),
      evidence({ laneEdge: -6, lanesWithData: 3 }),
      true,
    );
    expect(rep.deciders[0]).toMatchObject({ key: "lanes", favours: "radiant" });
    expect(rep.provisional).toBe(false);
  });

  it("has no grade before any hero is picked", () => {
    expect(sideReport(evidence({ heroes: 0 }))).toMatchObject({ overall: null, grade: null });
  });
});

describe("positions set by hand", () => {
  it("keeps the chosen positions and fills the rest around them", () => {
    const a = assignPositions(
      [hero(1), hero(2), hero(16)],
      table,
      new Map([
        [1, 2],
        [2, 1],
      ]),
    );
    const pos = Object.fromEntries(a.heroes.map((h) => [h.heroId, h.position]));
    expect(pos).toEqual({ 1: 2, 2: 1, 16: 3 });
  });

  it("ignores a second hero pinned to a taken position", () => {
    const a = assignPositions(
      [hero(1), hero(11)],
      table,
      new Map([
        [1, 1],
        [11, 1],
      ]),
    );
    expect(new Set(a.heroes.map((h) => h.position)).size).toBe(2);
  });
});

describe("lanes in the outlook and in picks", () => {
  const lanes = new Map([
    [laneKey(1, 13), { games: 20, wins: 16 }],
    [laneKey(5, 14), { games: 12, wins: 9 }],
  ]);

  it("uses pro lane results for the lane and counts them in the estimate", () => {
    const res = draftOutlook({
      radiant: [hero(1), hero(5)],
      dire: [hero(13), hero(14)],
      meta: new Map(),
      matchups: new Map(),
      positions: table,
      lanes,
    });
    const safe = res.lanes.find((l) => l.lane === "radiant_safe")!;
    expect(safe).toMatchObject({ source: "pro_lanes", games: 32, wins: 25 });
    expect(res.sides.radiant.lanes).toBeGreaterThan(0);
    expect(res.radiantPct).toBeGreaterThan(50);
    expect(res.report.radiant.criteria.find((c) => c.key === "lanes")?.grade).toMatch(/[AB]/);
    expect(res.report.provisional).toBe(true);
  });

  it("prefers the pick that wins its lane against the enemy", () => {
    const ranked = rankCandidates({
      action: "pick",
      available: [hero(1), hero(11)],
      own: [],
      enemy: [hero(13)],
      ownPicksLeft: 5,
      enemyPicksLeft: 4,
      meta: new Map(),
      matchups: new Map(),
      positions: table,
      lanes: new Map([
        [laneKey(1, 13), { games: 20, wins: 16 }],
        [laneKey(11, 13), { games: 20, wins: 5 }],
      ]),
    });
    expect(ranked[0].heroId).toBe(1);
    expect(ranked[0].laneEdge).toBeGreaterThan(0);
    expect(ranked[0].facts.join(" ")).toContain("in lane vs their Hero 13: won 16 of 20 pro lanes");
  });
});
