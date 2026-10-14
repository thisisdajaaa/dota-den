import { describe, expect, it } from "vitest";
import {
  buildPlan,
  dismissStep,
  pickSwap,
  sessionsPlayedOn,
  stepProgress,
  swapStep,
  type HeroPick,
  type PlanInput,
  type PlanStep,
  type PlanWeek,
  type RecentLoss,
} from "@/modules/practice/domain/practice-plan";

const pick = (heroId: number, counter: HeroPick["counter"] = null): HeroPick => ({
  heroId,
  highRank: { rate: 0.54, games: 2000 },
  contestRate: 0.3,
  counter,
});
const loss = (matchId: string, daysAgo: number): RecentLoss => ({
  matchId,
  heroId: 1,
  startedAt: new Date(Date.UTC(2026, 9, 15) - daysAgo * 86_400_000),
  kills: 2,
  deaths: 9,
  assists: 4,
});
const tilt = (afterGames: number, afterRate: number) => ({
  after: { games: afterGames, wins: Math.round(afterGames * afterRate), rate: afterRate },
  baseline: { games: 200, wins: 104, rate: 0.52 },
  backed: afterGames >= 20 && 0.52 - afterRate >= 0.03,
  minGames: 20,
});
const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  heroes: { status: "ok", position: 2, picks: [pick(10), pick(11), pick(12)] },
  tilt: tilt(30, 0.4),
  losses: [loss("m3", 1), loss("m2", 3), loss("m1", 5)],
  logging: { sessions: 6, logged: 1 },
  ...over,
});

describe("building the practice plan", () => {
  it("puts personal steps first, at most four, with the rest kept for swaps", () => {
    const plan = buildPlan(input());
    expect(plan.personal).toBe(true);
    expect(plan.steps.map((s) => s.id)).toEqual([
      "practiceHero:10",
      "stopAfterLosses",
      "reviewLoss:m3",
      "logMmr",
    ]);
    expect(plan.alternates.map((s) => s.id)).toEqual([
      "practiceHero:11",
      "practiceHero:12",
      "reviewLoss:m2",
      "reviewLoss:m1",
    ]);
    expect(plan.gaps).toEqual([]);
  });

  it("only suggests stopping after losses when the player's history backs it", () => {
    const few = buildPlan(input({ tilt: tilt(12, 0.3) }));
    expect(few.steps.some((s) => s.kind === "stopAfterLosses")).toBe(false);
    expect(few.gaps).toContainEqual({ kind: "tiltSample", games: 12, min: 20 });
    // Plenty of games but no clear drop: no step, and nothing to unlock either.
    const noDrop = buildPlan(input({ tilt: tilt(40, 0.51) }));
    expect(noDrop.steps.some((s) => s.kind === "stopAfterLosses")).toBe(false);
    const stop = buildPlan(input()).steps.find((s) => s.kind === "stopAfterLosses");
    expect(stop).toMatchObject({ streak: 2, reason: { after: { games: 30, rate: 0.4 } } });
  });

  it("asks for MMR logging only when recent sessions mostly went unlogged", () => {
    expect(
      buildPlan(input({ logging: { sessions: 6, logged: 4 } })).steps.some(
        (s) => s.kind === "logMmr",
      ),
    ).toBe(false);
    expect(buildPlan(input()).steps.find((s) => s.kind === "logMmr")).toMatchObject({
      reason: { logged: 1, sessions: 6 },
    });
  });

  it("falls back to the basics, and says why, when the data is thin", () => {
    const plan = buildPlan({
      heroes: { status: "no_role" },
      tilt: tilt(3, 0.3),
      losses: [loss("m1", 2)],
      logging: { sessions: 0, logged: 0 },
    });
    expect(plan.personal).toBe(false);
    expect(plan.steps.map((s) => s.id)).toEqual(["reviewLoss:m1", "logMmr"]);
    expect(plan.steps[1]).toMatchObject({ reason: null });
    expect(plan.gaps).toEqual([{ kind: "noRole" }, { kind: "tiltSample", games: 3, min: 20 }]);
  });

  it("leaves hero advice out (without a gap) when it couldn't be fetched", () => {
    const plan = buildPlan(input({ heroes: null }));
    expect(plan.steps.some((s) => s.kind === "practiceHero")).toBe(false);
    expect(plan.gaps).toEqual([]);
  });

  it("keeps the counter reason with the hero step", () => {
    const counter = { nemesisId: 99, yourLossRate: 0.61, yourGames: 25 };
    const plan = buildPlan(
      input({ heroes: { status: "ok", position: 1, picks: [pick(10, counter)] } }),
    );
    expect(plan.steps[0]).toMatchObject({
      kind: "practiceHero",
      target: 3,
      reason: { position: 1, counter },
    });
  });
});

describe("swapping and dismissing", () => {
  const plan = buildPlan(input());

  it("swaps a step for one of the same kind, and keeps the old one for later", () => {
    const next = swapStep(plan, "practiceHero:10")!;
    expect(next.steps[0].id).toBe("practiceHero:11");
    expect(next.alternates.at(-1)?.id).toBe("practiceHero:10");
    expect(next.alternates.some((a) => a.id === "practiceHero:11")).toBe(false);
  });

  it("swaps to a kind not already in the plan when there's none of the same kind", () => {
    const steps: PlanStep[] = [{ id: "logMmr", kind: "logMmr", reason: null }];
    const alternates = plan.alternates.filter((a) => a.kind === "reviewLoss");
    expect(pickSwap({ steps, alternates }, "logMmr")?.id).toBe("reviewLoss:m2");
    expect(pickSwap({ steps, alternates: [] }, "logMmr")).toBeNull();
    expect(swapStep({ steps, alternates: [] }, "logMmr")).toBeNull();
    expect(pickSwap(plan, "nope")).toBeNull();
  });

  it("dismisses a step for the week", () => {
    expect(dismissStep(plan, "stopAfterLosses")?.steps.map((s) => s.id)).not.toContain(
      "stopAfterLosses",
    );
    expect(dismissStep(plan, "nope")).toBeNull();
  });
});

describe("step progress", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 12) + h * 3_600_000);
  const g = (result: "win" | "loss", heroId = 1) => ({ result, heroId });
  const week: PlanWeek = {
    sessions: [
      { startedAt: t(1), endedAt: t(3), games: [g("loss"), g("loss"), g("win", 10)] },
      { startedAt: t(30), endedAt: t(32), games: [g("loss"), g("win", 10), g("loss")] },
    ],
    mmrEntries: [t(4)],
    reviewed: new Set(["m3"]),
  };
  const plan = buildPlan(input());
  const step = (id: string) => plan.steps.find((s) => s.id === id)!;

  it("counts ranked games on the suggested hero", () => {
    expect(stepProgress(step("practiceHero:10"), week)).toEqual({
      status: { kind: "heroGames", played: 2, target: 3 },
      done: null,
      fraction: 2 / 3,
    });
  });

  it("marks the streak rule broken in a session that played on after 2 losses", () => {
    expect(sessionsPlayedOn(week, 2)).toBe(1);
    expect(stepProgress(step("stopAfterLosses"), week)).toMatchObject({
      status: { kind: "streakRule", sessions: 2, broken: 1 },
      done: false,
    });
    const kept = { ...week, sessions: week.sessions.slice(1) };
    expect(stepProgress(step("stopAfterLosses"), kept).done).toBe(true);
    expect(stepProgress(step("stopAfterLosses"), { ...week, sessions: [] }).done).toBeNull();
  });

  it("ticks the review once the match has a note or the reviewed tag", () => {
    expect(stepProgress(step("reviewLoss:m3"), week)).toMatchObject({
      status: { kind: "reviewed" },
      done: true,
    });
    expect(stepProgress(step("reviewLoss:m3"), { ...week, reviewed: new Set() }).done).toBeNull();
  });

  it("counts sessions with MMR logged within 3 hours of their end", () => {
    expect(stepProgress(step("logMmr"), week)).toMatchObject({
      status: { kind: "sessionsLogged", logged: 1, total: 2 },
      done: null,
      fraction: 0.5,
    });
  });
});
