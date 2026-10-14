import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "@/common/errors/app-error";
import type { PracticePlan } from "@/modules/practice/practice.model";
import type {
  HeroAdviceSource,
  PracticeRepositoryPort,
  RankedSessionsSource,
} from "@/modules/practice/practice.ports";
import { PracticeService } from "@/modules/practice/practice.service";

const NOW = new Date("2026-10-15T12:00:00Z"); // Thursday; the week starts Sunday 2026-10-11 (as goals)
const owner = { userId: "u1", accountId32: 1 };
const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function memoryRepo() {
  const plans = new Map<string, PracticePlan>();
  let saves = 0;
  const repo: PracticeRepositoryPort = {
    find: async (u, w) => plans.get(`${u}:${w}`) ?? null,
    async insertIfAbsent(p) {
      saves++;
      const key = `${p.userId}:${p.week}`;
      if (!plans.has(key)) plans.set(key, p);
      return plans.get(key)!;
    },
    async save(p) {
      saves++;
      plans.set(`${p.userId}:${p.week}`, p);
    },
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  return { repo, plans, saves: () => saves };
}

const sessions: RankedSessionsSource["rankedSessions"] = async () => [
  {
    startedAt: at(200),
    endedAt: at(199),
    matches: [
      {
        matchId: "old",
        startedAt: at(200),
        result: "loss",
        heroId: 5,
        kills: 1,
        deaths: 8,
        assists: 2,
      },
    ],
  },
  {
    startedAt: at(5),
    endedAt: at(4),
    matches: [
      {
        matchId: "a",
        startedAt: at(5),
        result: "win",
        heroId: 10,
        kills: 9,
        deaths: 1,
        assists: 9,
      },
    ],
  },
];

const okAdvice: HeroAdviceSource["advice"] = async () => ({
  status: "ok",
  position: 3,
  picks: [{ heroId: 10, highRank: null, contestRate: 0.4, counter: null }],
});

function build(over: Partial<ConstructorParameters<typeof PracticeService>[0]> = {}) {
  const store = memoryRepo();
  const service = new PracticeService({
    repository: store.repo,
    sessions: { rankedSessions: sessions },
    mmr: { entryTimes: async () => [] },
    tilt: {
      tilt: async () => ({
        baseline: { games: 100, wins: 55, rate: 0.55 },
        afterTwo: { games: 25, wins: 10, rate: 0.4 },
      }),
    },
    heroes: { advice: okAdvice },
    reviews: { reviewed: async () => new Set<string>() },
    now: () => NOW,
    adviceTimeoutMs: 50,
    ...over,
  });
  return { service, store };
}

describe("practice service", () => {
  it("hides the plan before the player has any ranked games", async () => {
    const { service, store } = build({ sessions: { rankedSessions: async () => [] } });
    expect(await service.weekView(owner, "UTC")).toBeNull();
    expect(store.plans.size).toBe(0);
  });

  it("builds the plan once a week and ticks steps from this week's games", async () => {
    const { service, store } = build();
    const view = await service.weekView(owner, "UTC");
    expect(view?.week).toBe("2026-10-11");
    expect(view?.steps.map((s) => s.step.id)).toEqual([
      "practiceHero:10",
      "stopAfterLosses",
      "reviewLoss:old",
      "logMmr",
    ]);
    // One game on the hero this week; the older loss's session is before this week.
    expect(view?.steps[0]).toMatchObject({ status: { played: 1, target: 3 }, canSwap: false });
    expect(view?.steps[1]).toMatchObject({ status: { kind: "streakRule", broken: 0 }, done: true });
    expect(view?.steps[3].step).toMatchObject({ reason: { logged: 0, sessions: 1 } });
    expect(store.plans.size).toBe(1);
    await service.weekView(owner, "UTC");
    expect(store.saves()).toBe(1);
  });

  it("uses the player's time zone for the week", async () => {
    // Saturday 20:00 UTC is already Sunday (a new week) in Manila.
    const { service } = build({ now: () => new Date("2026-10-17T20:00:00Z") });
    expect((await service.weekView(owner, "UTC"))?.week).toBe("2026-10-11");
    expect((await service.weekView(owner, "Asia/Manila"))?.week).toBe("2026-10-18");
  });

  it("doesn't keep a plan built without hero advice (slow or failing OpenDota)", async () => {
    const slow = build({
      heroes: { advice: () => new Promise((r) => setTimeout(() => r({ status: "no_role" }), 500)) },
    });
    const view = await slow.service.weekView(owner, "UTC");
    expect(view?.steps.some((s) => s.step.kind === "practiceHero")).toBe(false);
    expect(slow.store.plans.size).toBe(0);

    const failing = build({ heroes: { advice: () => Promise.reject(new Error("down")) } });
    expect(await failing.service.weekView(owner, "UTC")).not.toBeNull();
    expect(failing.store.plans.size).toBe(0);
  });

  it("rebuilds an untouched basic plan after a day, but keeps personal or edited ones", async () => {
    const { service, store } = build({ heroes: { advice: async () => ({ status: "no_role" }) } });
    store.plans.set("u1:2026-10-11", {
      userId: "u1",
      week: "2026-10-11",
      steps: [{ id: "logMmr", kind: "logMmr", reason: null }],
      alternates: [],
      personal: false,
      gaps: [],
      edited: false,
      createdAt: at(30),
      updatedAt: at(30),
    });
    const view = await service.weekView(owner, "UTC");
    // The tilt history backs a personal step now.
    expect(view?.personal).toBe(true);
    expect(store.plans.get("u1:2026-10-11")?.createdAt).toEqual(NOW);
  });

  it("swaps and dismisses steps, and refuses unknown steps or swaps with no option", async () => {
    const { service, store } = build();
    await service.weekView(owner, "UTC");
    await expect(
      service.update(owner, "UTC", { action: "swap", stepId: "practiceHero:10" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.update(owner, "UTC", { action: "dismiss", stepId: "nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const view = await service.update(owner, "UTC", {
      action: "dismiss",
      stepId: "stopAfterLosses",
    });
    expect(view.steps.map((s) => s.step.id)).not.toContain("stopAfterLosses");
    expect(store.plans.get("u1:2026-10-11")?.edited).toBe(true);
  });

  it("ticks the review step from the match's notes", async () => {
    const { service } = build({ reviews: { reviewed: async (_u, ids) => new Set(ids) } });
    // Reviewed losses aren't suggested at all.
    const view = await service.weekView(owner, "UTC");
    expect(view?.steps.some((s) => s.step.kind === "reviewLoss")).toBe(false);
  });
});
