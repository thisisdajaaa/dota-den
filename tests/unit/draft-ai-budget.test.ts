import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/common/result";
import type { DraftAdvisor, DraftInsights, DraftReviewer } from "@/modules/drafts/drafts.ports";
import type { DraftSnapshot } from "@/modules/drafts/domain/snapshot";
import type { AiHero } from "@/modules/drafts/dtos/responses/drafts.dto";
import { BudgetedDraftAdvisor } from "@/modules/drafts/infrastructure/budgeted-draft-advisor";
import { AiOpponentService } from "@/modules/drafts/services/ai-opponent.service";

// No Redis in unit tests: the budget counts in memory.
vi.mock("@/common/cache/redis", () => ({ getRedis: () => null }));
const logged = vi.hoisted(() => ({ info: [] as unknown[][], warn: [] as unknown[][] }));
vi.mock("@/common/logging/logger", () => ({
  logger: {
    info: (...a: unknown[]) => logged.info.push(a),
    warn: (...a: unknown[]) => logged.warn.push(a),
    error: () => {},
    debug: () => {},
  },
}));
const { dailyCallBudget } = await import("@/common/llm/call-budget");

const heroes: AiHero[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `Hero ${i + 1}`,
  roles: i < 20 ? ["Carry", "Nuker"] : ["Support", "Disabler"],
}));
const direTurn: DraftSnapshot = { v: 1, r: "cm-2026", rv: 1, f: "radiant", t: [1, 2] };

// Hero 7 is the clear best ban, so it's on the model's shortlist.
const insights: DraftInsights = {
  heroMeta: async () => new Map([[7, { games: 100_000, wins: 55_000 }]]),
  matchups: async () => new Map(),
};

function model() {
  return {
    model: "test-model",
    suggest: vi.fn(async () => ok({ heroId: 7, reason: "Deny their carry." })),
    review: vi.fn(async () => ok({})),
  } satisfies DraftAdvisor & DraftReviewer;
}

describe("AI captain daily budget", () => {
  it("calls the model while there is budget, then plays the data-driven pick", async () => {
    const inner = model();
    let left = 1;
    const advisor = new BudgetedDraftAdvisor(inner, { take: async () => left-- > 0 });
    const svc = new AiOpponentService({ advisor, insights, heroes });

    expect(await svc.move(direTurn, "dire")).toMatchObject({
      ok: true,
      value: { source: "model", heroId: 7 },
    });
    // Out of budget: no model call, no error, a heuristic move.
    expect(await svc.move(direTurn, "dire")).toMatchObject({
      ok: true,
      value: { source: "heuristic", model: null },
    });
    expect(inner.suggest).toHaveBeenCalledTimes(1);
  });

  it("refuses a review without calling the model once the budget is spent", async () => {
    const inner = model();
    const advisor = new BudgetedDraftAdvisor(inner, { take: async () => false });
    expect(await advisor.review({ lineups: { radiant: [], dire: [] }, evidence: [] })).toEqual(
      err({ type: "unavailable", cause: "daily budget" }),
    );
    expect(inner.review).not.toHaveBeenCalled();
  });

  it("counts calls against the daily cap and logs the milestones", async () => {
    const budget = dailyCallBudget("test-drafts", 4);
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await budget.take());
    expect(answers).toEqual([true, true, true, true, false]);
    expect(logged.info.map(([event, data]) => [event, data])).toEqual([
      ["llm_budget_usage", { budget: "test-drafts", used: 2, cap: 4 }],
      ["llm_budget_usage", { budget: "test-drafts", used: 3, cap: 4 }],
      ["llm_budget_usage", { budget: "test-drafts", used: 4, cap: 4 }],
    ]);
    expect(logged.warn[0]).toEqual(["llm_budget_exhausted", { budget: "test-drafts", cap: 4 }]);
  });
});
