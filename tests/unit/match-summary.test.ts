import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLE,
  summarizeMatches,
  type SummaryInput,
} from "@/modules/matches/domain/match-summary";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";

let id = 0;
function m(overrides: Partial<SummaryInput> = {}): SummaryInput {
  id++;
  return {
    matchId: String(id),
    startedAt: new Date(Date.UTC(2026, 0, 1) + id * 3_600_000),
    heroId: 1,
    result: "win",
    kills: 5,
    deaths: 5,
    assists: 5,
    queueClass: "solo",
    partySize: 1,
    ...overrides,
  };
}

describe("summarizeMatches", () => {
  it("reports null win rates, not 0%, when there are no games", () => {
    const s = summarizeMatches([]);
    expect(s.overall).toEqual({ games: 0, wins: 0, losses: 0, winRate: null, lowSample: true });
    expect(s.averages).toBeNull();
    expect(s.form).toEqual([]);
  });

  it("splits records by queue class and totals reconcile", () => {
    const s = summarizeMatches([
      m({ result: "win" }),
      m({ result: "loss" }),
      m({ queueClass: "party", partySize: 3, result: "win" }),
      m({ queueClass: "unknown", partySize: null, result: "loss" }),
    ]);
    expect(s.byQueue.solo).toMatchObject({ games: 2, wins: 1, winRate: 0.5 });
    expect(s.byQueue.party).toMatchObject({ games: 1, wins: 1, winRate: 1 });
    expect(s.byQueue.unknown).toMatchObject({ games: 1, wins: 0 });
    const q = s.byQueue;
    expect(q.solo.games + q.party.games + q.unknown.games).toBe(s.overall.games);
    expect(s.byPartySize).toEqual([expect.objectContaining({ partySize: 3, games: 1 })]);
  });

  it("flags low samples below the threshold", () => {
    const few = summarizeMatches(Array.from({ length: MIN_SAMPLE - 1 }, () => m()));
    const enough = summarizeMatches(Array.from({ length: MIN_SAMPLE }, () => m()));
    expect(few.overall.lowSample).toBe(true);
    expect(enough.overall.lowSample).toBe(false);
  });

  it("orders form most recent first regardless of input order", () => {
    const a = m({ startedAt: new Date("2026-01-01") });
    const b = m({ startedAt: new Date("2026-02-01") });
    expect(summarizeMatches([a, b]).form.map((f) => f.matchId)).toEqual([b.matchId, a.matchId]);
  });

  it("ranks heroes by games and computes KDA from totals", () => {
    const s = summarizeMatches([
      m({ heroId: 2, kills: 10, deaths: 0, assists: 0 }),
      m({ heroId: 1 }),
      m({ heroId: 1, result: "loss" }),
    ]);
    expect(s.heroes.map((h) => h.heroId)).toEqual([1, 2]);
    expect(s.heroes[0]).toMatchObject({ games: 2, winRate: 0.5, kda: 2 });
    // Zero deaths divides by 1, not 0.
    expect(s.heroes[1].kda).toBe(10);
    expect(s.distinctHeroes).toBe(2);
  });
});

describe("parseRankTier", () => {
  it("decodes medal and stars", () => {
    expect(parseRankTier(54)).toEqual({ medal: "Legend", stars: 4, leaderboardRank: null });
    expect(parseRankTier(80)).toEqual({ medal: "Immortal", stars: 0, leaderboardRank: null });
  });

  it("attaches the leaderboard position to Immortal only", () => {
    expect(parseRankTier(80, 1053)).toMatchObject({ medal: "Immortal", leaderboardRank: 1053 });
    expect(parseRankTier(75, 1053)).toMatchObject({ medal: "Divine", leaderboardRank: null });
    expect(parseRankTier(80, 0)?.leaderboardRank).toBeNull();
  });

  it("rejects missing or malformed tiers", () => {
    for (const t of [null, undefined, 0, 9, 96, 57]) expect(parseRankTier(t)).toBeNull();
  });
});

describe("averageRankTier", () => {
  it("averages public ranks and ignores missing ones", async () => {
    const { averageRankTier } = await import("@/modules/matches/domain/rank-tier");
    expect(averageRankTier([54, 52, null, 53])).toEqual({
      rank: { medal: "Legend", stars: 3, leaderboardRank: null },
      ranked: 3,
    });
    expect(averageRankTier([80, 80, 75])?.rank.medal).toBe("Divine");
    expect(averageRankTier([80, 80])?.rank).toEqual({
      medal: "Immortal",
      stars: 0,
      leaderboardRank: null,
    });
    expect(averageRankTier([null, 0, undefined as unknown as null])).toBeNull();
  });
});

describe("sortHeroes", () => {
  const hero = (heroId: number, games: number, wins: number, kda: number, day: number) => ({
    heroId,
    games,
    wins,
    losses: games - wins,
    winRate: wins / games,
    lowSample: games < 10,
    kda,
    lastPlayed: new Date(Date.UTC(2026, 8, day)),
  });
  const pool = [
    hero(1, 40, 20, 3, 1),
    hero(2, 1, 1, 12, 29),
    hero(3, 8, 6, 4.5, 10),
    hero(4, 12, 9, 2, 20),
  ];

  it("sorts by games, win rate, KDA and recency", async () => {
    const { sortHeroes } = await import("@/modules/matches/domain/match-summary");
    expect(sortHeroes(pool, "games").map((h) => h.heroId)).toEqual([1, 4, 3, 2]);
    // Win rate and KDA only rank heroes with 10+ games (1 and 4 here).
    expect(sortHeroes(pool, "winrate").map((h) => h.heroId)).toEqual([4, 1]);
    expect(sortHeroes(pool, "kda").map((h) => h.heroId)).toEqual([1, 4]);
    expect(sortHeroes(pool, "recent").map((h) => h.heroId)).toEqual([2, 4, 3, 1]);
  });

  it("leaves out small samples (fewer than 10 games) from win rate and KDA sorts", async () => {
    const { sortHeroes } = await import("@/modules/matches/domain/match-summary");
    expect(sortHeroes(pool, "winrate").some((h) => h.heroId === 2)).toBe(false);
    expect(sortHeroes(pool, "kda").some((h) => h.heroId === 3)).toBe(false); // 8 games
  });

  it("breaks win-rate ties by games played", async () => {
    const { sortHeroes } = await import("@/modules/matches/domain/match-summary");
    const tied = [hero(7, 12, 9, 2, 1), hero(8, 20, 15, 2, 1)]; // both 75%
    expect(sortHeroes(tied, "winrate").map((h) => h.heroId)).toEqual([8, 7]);
  });
});
