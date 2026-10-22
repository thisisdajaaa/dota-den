import { describe, expect, it, vi } from "vitest";
import { bestHeroOf, rankWeek } from "@/modules/leaderboards/domain/ranked-week";
import { RankedWeekService } from "@/modules/leaderboards/services/ranked-week.service";

const p = (accountId32: number, wins: number, losses: number) => ({
  accountId32,
  wins,
  losses,
  bestHero: null,
});

describe("rankWeek", () => {
  it("ranks by net wins, then win rate, sharing ranks on ties, and lists who didn't play", () => {
    const { rows, idle } = rankWeek([p(1, 5, 5), p(2, 6, 2), p(3, 0, 0), p(4, 4, 0), p(5, 4, 0)]);
    expect(rows.map((r) => [r.accountId32, r.rank, r.estimatedNet])).toEqual([
      [4, 1, 100],
      [5, 1, 100],
      [2, 3, 100],
      [1, 4, 0],
    ]);
    expect(idle).toEqual([3]);
  });
});

describe("bestHeroOf", () => {
  it("picks the most wins from 2+ games", () => {
    expect(
      bestHeroOf([
        { heroId: 1, games: 1, wins: 1 },
        { heroId: 2, games: 5, wins: 3 },
        { heroId: 3, games: 3, wins: 3 },
      ]),
    ).toEqual({ heroId: 3, games: 3, wins: 3 });
    expect(bestHeroOf([{ heroId: 1, games: 1, wins: 1 }])).toBeNull();
  });
});

describe("RankedWeekService", () => {
  const record = (accountId32: number, wins: number, losses: number) => ({
    accountId32,
    wins,
    losses,
    bestHero: null,
  });

  it("names every row and checks idle players in one profile lookup, beside best heroes", async () => {
    const lookups: number[][] = [];
    let release: () => void = () => {};
    const profilesDone = new Promise<void>((r) => (release = r));
    const bestHero = vi.fn(async () => {
      // Best heroes start before the profile lookup has finished.
      release();
      return { heroId: 1, games: 2, wins: 2 };
    });
    const service = new RankedWeekService({
      friends: { friendAccountIds: async () => ({ accountIds: [2, 3, 4], incomplete: false }) },
      week: {
        recordFor: async (id) => (id === 4 ? null : id === 3 ? record(3, 0, 0) : record(id, 3, id)),
        bestHero,
      },
      profiles: {
        publicProfiles: async (ids) => {
          lookups.push([...ids]);
          await profilesDone;
          return new Map(
            ids.map((id) => [
              id,
              { personaName: `P${id}`, avatarUrl: null, matchHistory: id === 3 ? "full" : null },
            ]),
          );
        },
      },
    });
    const view = await service.forViewer({ userId: "u1", accountId32: 1 });
    expect(lookups).toHaveLength(1);
    expect([...lookups[0]].sort()).toEqual([1, 2, 3]);
    expect(bestHero).toHaveBeenCalledTimes(2);
    expect(view.rows.map((r) => [r.accountId32, r.name, r.you])).toEqual([
      [1, "P1", true],
      [2, "P2", false],
    ]);
    // 3 played 0–0 with a fully public history; 4 had no record at all.
    expect(view.idle).toBe(1);
    expect(view.unknown).toBe(1);
  });
});
