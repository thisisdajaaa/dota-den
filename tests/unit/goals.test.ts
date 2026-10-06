import { describe, expect, it } from "vitest";
import { finalResult, goalProgress, type WeekData } from "@/modules/goals/domain/goals";

const t = (h: number) => new Date(Date.UTC(2026, 9, 5) + h * 3_600_000);
const week: WeekData = {
  games: [
    { startedAt: t(1), result: "win", heroId: 1 },
    { startedAt: t(2), result: "win", heroId: 1 },
    { startedAt: t(3), result: "loss", heroId: 2 },
    { startedAt: t(30), result: "win", heroId: 1 },
    { startedAt: t(31), result: "loss", heroId: 1 },
    { startedAt: t(32), result: "win", heroId: 3 },
  ],
  sessions: [
    { startedAt: t(1), endedAt: t(4), rankedGames: 3 },
    { startedAt: t(30), endedAt: t(33), rankedGames: 3 },
  ],
  mmrEntries: [t(5)],
};

describe("weekly goals", () => {
  it("measures win rate once there are enough games", () => {
    expect(goalProgress({ type: "winRate", target: 60 }, week)).toMatchObject({
      current: "67% (4–2)",
      status: { kind: "winRate", rate: 67, wins: 4, losses: 2 },
      met: true,
    });
    const few = { ...week, games: week.games.slice(0, 3) };
    expect(goalProgress({ type: "winRate", target: 60 }, few)).toMatchObject({
      status: { kind: "needGames", games: 3, min: 5 },
      met: null,
    });
  });

  it("checks session length and MMR logging per session", () => {
    expect(goalProgress({ type: "maxPerSession", target: 3 }, week).met).toBe(true);
    expect(goalProgress({ type: "maxPerSession", target: 2 }, week).met).toBe(false);
    // Logged after the first session (within 3h of its end), not after the second.
    expect(goalProgress({ type: "logAfterSessions" }, week)).toMatchObject({
      current: "1 / 2 sessions logged",
      status: { kind: "sessionsLogged", logged: 1, total: 2 },
      met: false,
    });
  });

  it("counts hero games and custom goals", () => {
    const hero = goalProgress({ type: "heroGames", heroId: 1, target: 5 }, week);
    expect(hero).toMatchObject({
      current: "4 / 5 games",
      status: { kind: "heroGames", played: 4, target: 5 },
      met: null,
    });
    expect(finalResult(hero)).toBe(false);
    expect(goalProgress({ type: "custom", text: "Ward more", done: true }, week).met).toBe(true);
  });
});
