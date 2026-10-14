import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PracticeRepository } from "@/modules/practice/practice.repository";
import { PracticeService } from "@/modules/practice/practice.service";
import type { PracticePlan } from "@/modules/practice/practice.model";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
});
afterAll(async () => teardown?.());

const plan = (userId: string, stepId: string): PracticePlan => ({
  userId,
  week: "2026-10-12",
  steps: [{ id: stepId, kind: "logMmr", reason: null }],
  alternates: [],
  personal: false,
  gaps: [],
  edited: false,
  createdAt: new Date("2026-10-12T00:00:00Z"),
  updatedAt: new Date("2026-10-12T00:00:00Z"),
});

describe("practice plans repository", () => {
  it("keeps the first plan of the week when two views build one at once", async () => {
    const repo = new PracticeRepository(async () => db);
    await repo.ensureIndexes();
    const [a, b] = await Promise.all([
      repo.insertIfAbsent(plan("u1", "first")),
      repo.insertIfAbsent(plan("u1", "second")),
    ]);
    expect(a.steps[0].id).toBe(b.steps[0].id);
    const stored = await repo.find("u1", "2026-10-12");
    expect(stored?.steps[0].id).toBe(a.steps[0].id);
    expect(stored).not.toHaveProperty("_id");
    expect(await db.collection("practice_plans").countDocuments({ userId: "u1" })).toBe(1);
  });

  it("stores the plan per user and week, with dates, and replaces it on save", async () => {
    const repo = new PracticeRepository(async () => db);
    await repo.save({ ...plan("u2", "x"), edited: true });
    const stored = await repo.find("u2", "2026-10-12");
    expect(stored?.edited).toBe(true);
    expect(stored?.createdAt).toBeInstanceOf(Date);
    expect(await repo.find("u2", "2026-10-05")).toBeNull();
  });

  it("builds, stores and swaps a plan end to end", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const game = (id: string, h: number, result: "win" | "loss") => ({
      matchId: id,
      startedAt: at(h),
      result,
      heroId: 1,
      kills: 1,
      deaths: 5,
      assists: 3,
    });
    const service = new PracticeService({
      repository: new PracticeRepository(async () => db),
      now: () => now,
      sessions: {
        rankedSessions: async () => [
          { startedAt: at(50), endedAt: at(49), matches: [game("m1", 50, "loss")] },
          { startedAt: at(4), endedAt: at(3), matches: [game("m2", 4, "loss")] },
        ],
      },
      mmr: { entryTimes: async () => [] },
      tilt: {
        tilt: async () => ({
          baseline: { games: 100, wins: 52, rate: 0.52 },
          afterTwo: { games: 5, wins: 1, rate: 0.2 },
        }),
      },
      heroes: {
        advice: async () => ({
          status: "ok",
          position: 1,
          picks: [10, 11].map((heroId) => ({
            heroId,
            highRank: { rate: 0.54, games: 1000 },
            contestRate: null,
            counter: null,
          })),
        }),
      },
      reviews: { reviewed: async () => new Set<string>() },
    });
    const owner = { userId: "u3", accountId32: 3 };
    const view = await service.weekView(owner, "UTC");
    expect(view?.steps.map((s) => s.step.id)).toEqual(["practiceHero:10", "reviewLoss:m2"]);
    expect(view?.personal).toBe(true);

    const swapped = await service.update(owner, "UTC", {
      action: "swap",
      stepId: "practiceHero:10",
    });
    expect(swapped.steps[0].step.id).toBe("practiceHero:11");
    const again = await service.weekView(owner, "UTC");
    expect(again?.steps[0].step.id).toBe("practiceHero:11");

    await service.update(owner, "UTC", { action: "dismiss", stepId: "reviewLoss:m2" });
    expect((await service.weekView(owner, "UTC"))?.steps).toHaveLength(1);
    expect((await service.exportMyData(owner)).practicePlans).toHaveLength(1);
    expect(await service.deleteMyData(owner)).toEqual({ practicePlans: 1 });
  });
});
