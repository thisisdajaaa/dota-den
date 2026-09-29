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
