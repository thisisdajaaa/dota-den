import { describe, expect, it } from "vitest";
import {
  MIN_PAIR_GAMES,
  pickForMe,
  type HeroRecords,
  type PickInput,
} from "@/modules/drafts/domain/pick-for-me";
import { PickForMeService } from "@/modules/drafts/services/pick-for-me.service";

// Hero 1 counters enemy 9 and pairs well with ally 8; hero 2 struggles against 9.
const RECORDS: Record<number, HeroRecords> = {
  1: {
    games: 10_000,
    wins: 5_000,
    vs: new Map([[9, { games: 1_000, wins: 560 }]]),
    with: new Map([[8, { games: 600, wins: 330 }]]),
  },
  2: {
    games: 10_000,
    wins: 5_000,
    vs: new Map([[9, { games: 1_000, wins: 440 }]]),
    with: new Map(),
  },
  3: { games: 10_000, wins: 5_000, vs: new Map(), with: new Map() },
};

const base = (over: Partial<PickInput> = {}): PickInput => ({
  pool: [
    { heroId: 1, games: 40, wins: 20 },
    { heroId: 2, games: 40, wins: 20 },
    { heroId: 3, games: 40, wins: 20 },
  ],
  enemies: [9],
  allies: [8],
  unavailable: [],
  position: null,
  records: (id) => RECORDS[id],
  positionShare: () => null,
  ...over,
});

describe("pickForMe", () => {
  it("ranks your heroes by how they do against the enemy picks and with your allies", () => {
    const [first, second, third] = pickForMe(base());
    expect([first.heroId, second.heroId, third.heroId]).toEqual([1, 3, 2]);
    // 56% against 9 where it usually wins 50%: +6 points, shrunk by 1000/(1000+300).
    expect(first.counters).toEqual([{ heroId: 9, points: 4.6, games: 1_000 }]);
    expect(first.allies).toEqual([{ heroId: 8, points: 3.3, games: 600 }]);
    expect(first.score).toBeCloseTo(4.6 + 0.5 * 3.3, 0);
    expect(third.counters[0].points).toBe(-4.6);
  });

  it("counts your own record, pulled toward 50% on small samples", () => {
    const res = pickForMe(
      base({
        enemies: [],
        allies: [],
        pool: [
          { heroId: 1, games: 100, wins: 60 },
          { heroId: 2, games: 4, wins: 4 },
        ],
      }),
    );
    // 60-40 and a 4-0 start both shrink to 58.3%; the one you play more comes first.
    expect(res.map((r) => r.heroId)).toEqual([1, 2]);
    expect(res[1].you).toEqual({ games: 4, wins: 4, points: 8.3 });
  });

  it("leaves out taken heroes, heroes you barely play and thin head-to-head records", () => {
    const res = pickForMe(
      base({
        pool: [
          { heroId: 1, games: 40, wins: 20 },
          { heroId: 2, games: 2, wins: 2 },
          { heroId: 3, games: 40, wins: 20 },
        ],
        unavailable: [3],
        records: (id) =>
          id === 1
            ? { ...RECORDS[1], vs: new Map([[9, { games: MIN_PAIR_GAMES - 1, wins: 40 }]]) }
            : RECORDS[id],
      }),
    );
    expect(res.map((r) => r.heroId)).toEqual([1]);
    expect(res[0].counters).toEqual([]);
  });

  it("at a chosen position, keeps only heroes really played there", () => {
    const res = pickForMe(
      base({ position: 4, positionShare: (id) => (id === 2 ? 0.05 : id === 1 ? 0.6 : null) }),
    );
    // Hero 2 is played at Pos 4 in 5% of its games; hero 3's share is unknown, so it stays.
    expect(res.map((r) => r.heroId)).toEqual([1, 3]);
    expect(res[0].positionShare).toBe(0.6);
  });

  it("works without high-rank data, on your own record alone", () => {
    const res = pickForMe(base({ records: () => undefined }));
    expect(res).toHaveLength(3);
    expect(res.every((r) => r.counters.length === 0 && r.allies.length === 0)).toBe(true);
  });
});

describe("PickForMeService", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7].map((heroId) => ({
    heroId,
    games: 10,
    wins: 5 + (heroId % 3),
  }));
  const service = (plus: boolean, records: (() => Promise<null>) | undefined = undefined) =>
    new PickForMeService({
      pool: async () => pool,
      records:
        records ?? (async () => new Map(Object.entries(RECORDS).map(([k, v]) => [Number(k), v]))),
      positionShares: async () => null,
      isPlus: async () => plus,
      logger: { warn: () => {} },
    });
  const req = { enemies: [9], allies: [], bans: [], position: null };

  it("shows Plus the top five and everyone else the best one", async () => {
    const plus = await service(true).suggest({ id: "u", accountId32: 1 }, req);
    expect(plus).toMatchObject({ plan: "plus", locked: 0, poolSize: 7 });
    expect(plus.suggestions).toHaveLength(5);
    const free = await service(false).suggest({ id: "u", accountId32: 1 }, req);
    expect(free.suggestions).toEqual(plus.suggestions.slice(0, 1));
    expect(free).toMatchObject({ plan: "free", locked: 4 });
  });

  it("says when high-rank matchups were unavailable, and still answers", async () => {
    const res = await service(true, async () => {
      throw new Error("STRATZ down");
    }).suggest({ id: "u", accountId32: 1 }, req);
    expect(res.sources).toEqual({ highRank: false, positions: false });
    expect(res.suggestions.length).toBeGreaterThan(0);
  });
});
