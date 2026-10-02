import { describe, expect, it } from "vitest";
import { achievements, type AchievementGame } from "@/modules/achievements/domain/achievements";

let t = 0;
const g = (result: "win" | "loss", heroId = 1): AchievementGame => ({
  startedAt: new Date(Date.UTC(2026, 8, 1) + ++t * 3_600_000),
  result,
  heroId,
});

describe("achievements", () => {
  const sessions = [
    { matches: [g("loss"), g("loss"), g("loss"), g("win", 2), g("win", 3), g("win", 4)] },
    { matches: [g("win", 5), g("win", 6), g("loss")] },
  ];
  const all = achievements({ sessions, mmrDays: 7, drafts: 0, challenges: 30 });
  const by = (id: string) => all.find((a) => a.id === id)!;

  it("counts streaks across sessions, comebacks within them, and heroes won with", () => {
    expect(by("streak")).toMatchObject({ value: 5, tier: 2, next: 8 });
    expect(by("comeback")).toMatchObject({ value: 1, tier: 1, next: 5 });
    expect(by("pool")).toMatchObject({ value: 5, tier: 0, next: 10 });
    expect(by("marathon")).toMatchObject({ value: 6, tier: 1, next: 8 });
  });

  it("uses the other counts as given, and tops out", () => {
    expect(by("journal")).toMatchObject({ value: 7, tier: 2, next: 30 });
    expect(by("drafter")).toMatchObject({ value: 0, tier: 0, next: 1 });
    expect(by("puzzles")).toMatchObject({ value: 30, tier: 2, next: 100 });
    const maxed = achievements({ sessions: [], mmrDays: 99, drafts: 0, challenges: 0 });
    expect(maxed.find((a) => a.id === "journal")).toMatchObject({ tier: 3, next: null });
  });
});
