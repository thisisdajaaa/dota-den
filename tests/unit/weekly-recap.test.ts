import { describe, expect, it } from "vitest";
import { weeklyRecap, type RecapGame } from "@/modules/mmr/domain/weekly-recap";

const utc = (d: Date) => d.toISOString().slice(0, 10);
const g = (iso: string, heroId: number, result: "win" | "loss"): RecapGame => ({
  startedAt: new Date(iso),
  heroId,
  result,
  queueClass: "solo",
});
const week = { from: "2026-09-28", to: "2026-10-04" };
const loaded = { from: new Date(0), to: new Date("2026-12-31T00:00:00Z") };

describe("weeklyRecap", () => {
  const games = [
    g("2026-09-22T10:00:00Z", 1, "loss"), // last week
    g("2026-09-29T10:00:00Z", 1, "win"),
    g("2026-09-29T11:00:00Z", 1, "win"),
    g("2026-09-30T10:00:00Z", 1, "loss"),
    g("2026-10-01T10:00:00Z", 2, "win"),
    g("2026-10-01T11:00:00Z", 2, "win"),
    g("2026-10-01T12:00:00Z", 2, "win"),
    g("2026-10-01T13:00:00Z", 2, "win"),
  ];

  it("compares this week with last week and picks the heroes", () => {
    const r = weeklyRecap({ games, observations: [], week, dayKey: utc, loaded });
    expect(r.thisWeek).toEqual({ games: 7, wins: 6, losses: 1, winRate: 6 / 7 });
    expect(r.lastWeek).toEqual({ games: 1, wins: 0, losses: 1, winRate: 0 });
    expect(r.mostPlayed).toEqual({ heroId: 2, games: 4, wins: 4 });
    expect(r.best).toEqual({ heroId: 2, games: 4, wins: 4 });
    expect(r.mmr).toEqual({ exact: null, estimate: 125 });
  });

  it("is exact only when entries bracket the week's games", () => {
    const observations = [
      { observedAt: new Date("2026-09-27T20:00:00Z"), mmr: 4000 },
      { observedAt: new Date("2026-10-02T09:00:00Z"), mmr: 4140 },
    ];
    // Last week's game is before the first entry, so only this week's games are between.
    const r = weeklyRecap({ games, observations, week, dayKey: utc, loaded });
    expect(r.mmr.exact).toBe(140);
  });

  it("has no best hero below the minimum games", () => {
    const r = weeklyRecap({
      games: [g("2026-09-29T10:00:00Z", 5, "win"), g("2026-09-29T11:00:00Z", 5, "win")],
      observations: [],
      week,
      dayKey: utc,
      loaded,
    });
    expect(r.best).toBeNull();
    expect(r.mostPlayed).toEqual({ heroId: 5, games: 2, wins: 2 });
  });
});

describe("MmrInsightsService.weeklyRecap", () => {
  it("recaps another week when asked (the weekly email recaps the finished week)", async () => {
    const { MmrInsightsService } = await import("@/modules/mmr/services/mmr-insights.service");
    const ranked = [
      { ...g("2026-10-01T10:00:00Z", 2, "win"), matchId: "1" },
      { ...g("2026-10-06T10:00:00Z", 3, "loss"), matchId: "2" },
    ];
    const svc = new MmrInsightsService({
      journal: { list: async () => [] } as never,
      ranked: {
        rankedResults: async (_id, range) =>
          ranked.filter((m) => m.startedAt >= range.from && m.startedAt <= range.to),
      },
      medals: { history: async () => [] },
      now: () => new Date("2026-10-07T12:00:00Z"),
    });
    const owner = { userId: "u", accountId32: 1 };
    const current = await svc.weeklyRecap(owner, "UTC");
    expect([current.from, current.thisWeek.games]).toEqual(["2026-10-04", 1]);
    const previous = await svc.weeklyRecap(owner, "UTC", { weekOf: "2026-09-30" });
    expect([previous.from, previous.to]).toEqual(["2026-09-27", "2026-10-03"]);
    expect(previous.thisWeek).toMatchObject({ games: 1, wins: 1 });
    expect(previous.mostPlayed).toEqual({ heroId: 2, games: 1, wins: 1 });
  });
});
