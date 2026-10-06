import { describe, expect, it, vi } from "vitest";
import { AiOpponentService } from "@/modules/drafts/services/ai-opponent.service";
import { type AiHero } from "@/modules/drafts/dtos/responses/drafts.dto";
import type { DraftReviewer, ReviewRequest } from "@/modules/drafts/drafts.ports";
import type { DraftSnapshot } from "@/modules/drafts/domain/snapshot";
import type { DraftReport } from "@/modules/drafts/domain/draft-report";
import { sideReport } from "@/modules/drafts/domain/draft-report";
import {
  abilityTags,
  applyAdjustments,
  briefDescription,
  validateReview,
} from "@/modules/drafts/domain/draft-review";
import { GroqClient } from "@/common/llm/groq-client";
import { GroqDraftAdvisor } from "@/modules/drafts/infrastructure/groq-draft-advisor";
import { err, ok } from "@/common/result";

const heroes: AiHero[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `Hero ${i + 1}`,
  roles: i < 20 ? ["Carry", "Nuker"] : ["Support", "Disabler"],
}));
// Every step of cm-2026 taken with a different hero: a complete, legal draft.
const complete: DraftSnapshot = {
  v: 1,
  r: "cm-2026",
  rv: 1,
  f: "radiant",
  t: Array.from({ length: 24 }, (_, i) => i + 1),
};
const unfinished: DraftSnapshot = { ...complete, t: complete.t.slice(0, 10) };

const plan = {
  winCondition: "Fight early.",
  strengths: ["Stuns"],
  risks: ["Falls off"],
  timing: "15-25 min",
};
const goodReview = (names: string[]) => ({
  summary: "Radiant's stun chain should win early fights.",
  sides: { radiant: plan, dire: plan },
  combos: [
    { side: "radiant", heroes: [names[0], names[1]], why: "Chain stuns." },
    { side: "dire", heroes: ["Not A Hero"], why: "Invented." },
  ],
  keyMatchups: [{ heroes: [names[0], names[2]], note: "Kills it in lane." }],
  adjustments: [
    { side: "radiant", criterion: "combos", delta: 20, reason: "Huge teamfight combo." },
    { side: "radiant", criterion: "combos", delta: 3, reason: "Duplicate." },
    { side: "dire", criterion: "lanes", delta: 5, reason: "Not allowed." },
    { side: "dire", criterion: "composition", delta: -4, reason: "No initiation." },
  ],
});

describe("validateReview", () => {
  const names = ["Axe", "Lion", "Sniper"];

  it("keeps what's valid and drops invented heroes, disallowed criteria and duplicates", () => {
    const review = validateReview(goodReview(names), names)!;
    expect(review.combos).toHaveLength(1);
    expect(review.keyMatchups).toHaveLength(1);
    expect(review.adjustments).toEqual([
      { side: "radiant", criterion: "combos", delta: 8, reason: "Huge teamfight combo." },
      { side: "dire", criterion: "composition", delta: -4, reason: "No initiation." },
    ]);
  });

  it("rejects a review without a summary or side plans", () => {
    expect(validateReview({ summary: "x" }, names)).toBeNull();
    expect(validateReview("nope", names)).toBeNull();
  });
});

describe("applyAdjustments", () => {
  it("nudges the criterion and recomputes the overall grade", () => {
    const side = sideReport({
      heroes: 5,
      laneEdge: 0,
      lanesWithData: 1,
      proLanes: 1,
      counterEdge: 0,
      strengthEdge: 0,
      positionFit: 0.55,
      offRole: [],
      comboEdge: 0,
      comboPairs: 3,
      composition: [{ id: "initiation", label: "Initiation", passed: true, detail: "" }],
    });
    const report: DraftReport = { radiant: side, dire: side, deciders: [], provisional: false };
    const adjusted = applyAdjustments(report, [
      { side: "radiant", criterion: "combos", delta: 8, reason: "combo" },
    ]);
    const combos = (r: DraftReport) => r.radiant.criteria.find((c) => c.key === "combos")!.score;
    expect(combos(adjusted)).toBe(combos(report)! + 8);
    expect(adjusted.radiant.overall).toBeGreaterThan(report.radiant.overall!);
    expect(adjusted.dire).toEqual(report.dire);
  });
});

describe("ability briefs", () => {
  it("tags abilities from the game files and keeps descriptions short", () => {
    expect(
      abilityTags({
        behavior: "No Target",
        dmg_type: "Magical",
        bkbpierce: "Yes",
        target_team: "Enemy",
      }),
    ).toEqual(["magical damage", "pierces spell immunity"]);
    expect(abilityTags({ behavior: "['Passive', 'Aura']" })).toEqual(["passive", "aura"]);
    expect(briefDescription("Pulls enemies in. Then stuns them for a while.")).toBe(
      "Pulls enemies in.",
    );
    expect(briefDescription("x".repeat(300)).length).toBe(160);
  });
});

describe("AiOpponentService.review", () => {
  const reviewer = (answer: unknown) => {
    const review = vi.fn(async (_req: ReviewRequest) => ok(answer));
    return { model: "test-model", review } satisfies DraftReviewer;
  };

  it("needs a configured model and a finished draft", async () => {
    const none = new AiOpponentService({ advisor: null, insights: null, heroes });
    expect(await none.review(complete)).toEqual({ ok: false, error: { type: "not_configured" } });
    const svc = new AiOpponentService({
      advisor: null,
      insights: null,
      heroes,
      reviewer: reviewer({}),
    });
    expect(await svc.review(unfinished)).toEqual({
      ok: false,
      error: { type: "draft_incomplete" },
    });
  });

  it("sends both lineups with abilities and evidence, validates, applies nudges and caches", async () => {
    const store = new Map<string, unknown>();
    const cache = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      put: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    };
    let names: string[] = [];
    const rev = {
      model: "test-model",
      review: vi.fn(async (req: ReviewRequest) => {
        names = [...req.lineups.radiant, ...req.lineups.dire].map((h) => h.name);
        return ok(goodReview(names));
      }),
    } satisfies DraftReviewer;
    const abilities = {
      kits: vi.fn(
        async (ids: readonly number[]) =>
          new Map(
            ids.map((id) => [
              id,
              { heroId: id, abilities: [{ name: `Skill ${id}`, desc: "Stuns.", tags: [] }] },
            ]),
          ),
      ),
    };
    const svc = new AiOpponentService({
      advisor: null,
      insights: null,
      heroes,
      reviewer: rev,
      abilities,
      reviewCache: cache,
    });
    const first = await svc.review(complete);
    expect(first.ok).toBe(true);
    const req = rev.review.mock.calls[0][0];
    expect(req.lineups.radiant).toHaveLength(5);
    expect(req.lineups.radiant[0].abilities[0].name).toMatch(/^Skill \d+$/);
    expect(req.lineups.radiant[0].position).toMatch(/^Pos \d · /);
    expect(req.evidence.join(" ")).toContain("report card");
    if (first.ok) {
      expect(first.value.review.combos).toHaveLength(1);
      // Combos has no data here, so its nudge can't apply; Composition's does.
      expect(first.value.adjusted.radiant.overall).toBe(first.value.report.radiant.overall);
      expect(first.value.adjusted.dire.overall).toBeLessThan(first.value.report.dire.overall!);
    }
    // Same draft again: served from the cache, no second model call.
    const again = await svc.review(complete);
    expect(again.ok).toBe(true);
    expect(rev.review).toHaveBeenCalledTimes(1);
  });

  it("reports an unusable model answer as unavailable", async () => {
    const svc = new AiOpponentService({
      advisor: null,
      insights: null,
      heroes,
      reviewer: reviewer({ nonsense: true }),
    });
    expect(await svc.review(complete)).toEqual({ ok: false, error: { type: "unavailable" } });
    const failing = new AiOpponentService({
      advisor: null,
      insights: null,
      heroes,
      reviewer: { model: "m", review: async () => err({ type: "unavailable", cause: "503" }) },
    });
    expect(await failing.review(complete)).toEqual({ ok: false, error: { type: "unavailable" } });
  });
});

describe("GroqDraftAdvisor.review", () => {
  it("sends abilities and evidence and returns the parsed JSON", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].content).toContain("Skewer [magical damage]");
      expect(body.messages[1].content).toContain("EVIDENCE");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"summary":"ok"}' } }] }),
        { status: 200 },
      );
    });
    const adv = new GroqDraftAdvisor(new GroqClient({ apiKey: "k", fetch, retryDelayMs: 0 }), {
      model: "m",
    });
    const res = await adv.review({
      lineups: {
        radiant: [
          {
            name: "Magnus",
            position: "Pos 3 · Offlane",
            abilities: [{ name: "Skewer", desc: "Rushes forward.", tags: ["magical damage"] }],
          },
        ],
        dire: [],
      },
      evidence: ["Radiant report card: B."],
    });
    expect(res).toEqual({ ok: true, value: { summary: "ok" } });
  });
});
