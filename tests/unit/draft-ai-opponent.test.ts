import { describe, expect, it, vi } from "vitest";
import { AiOpponentService } from "@/modules/drafts/services/ai-opponent.service";
import { type AiHero } from "@/modules/drafts/dtos/responses/drafts.dto";
import type { AdvisorRequest, DraftAdvisor, DraftInsights } from "@/modules/drafts/drafts.ports";
import type { DraftSnapshot } from "@/modules/drafts/domain/snapshot";
import { GroqClient } from "@/common/llm/groq-client";
import { GroqDraftAdvisor } from "@/modules/drafts/infrastructure/groq-draft-advisor";
import { err, ok } from "@/common/result";

// 1-20 cores, 21-40 supports.
const heroes: AiHero[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `Hero ${i + 1}`,
  roles: i < 20 ? ["Carry", "Nuker"] : ["Support", "Disabler"],
}));

// cm-2026: step 1 is a ban by the first-pick team (radiant); steps 3-4 are dire bans.
const start: DraftSnapshot = { v: 1, r: "cm-2026", rv: 1, f: "radiant", t: [] };
const direTurn: DraftSnapshot = { ...start, t: [1, 2] };

const insights = (winRates: Record<number, number> = {}): DraftInsights => ({
  heroMeta: vi.fn(
    async () =>
      new Map(
        Object.entries(winRates).map(([id, wr]) => [
          Number(id),
          { games: 100_000, wins: wr * 100_000 },
        ]),
      ),
  ),
  matchups: vi.fn(async () => new Map()),
});

function advisor(result: Awaited<ReturnType<DraftAdvisor["suggest"]>>) {
  const suggest = vi.fn(async (_req: AdvisorRequest) => result);
  return { model: "test-model", suggest } satisfies DraftAdvisor;
}

describe("AiOpponentService", () => {
  it("gives the model a scored shortlist and uses its choice from it", async () => {
    const adv = advisor(ok({ heroId: 7, reason: "Deny their carry." }));
    const svc = new AiOpponentService({ advisor: adv, insights: insights({ 7: 0.55 }), heroes });
    const move = await svc.move(direTurn, "dire");
    expect(move).toMatchObject({ ok: true, value: { heroId: 7, source: "model", action: "ban" } });
    const req = adv.suggest.mock.calls[0][0];
    expect(req.candidates[0]).toMatchObject({ id: 7, name: "Hero 7" });
    expect(req.candidates[0].facts.join(" ")).toContain("55.0% win rate");
    expect(req.candidates.length).toBeLessThanOrEqual(12);
  });

  it.each([
    ["a hero outside the shortlist", ok({ heroId: 39, reason: "off-list" })],
    ["an already banned hero", ok({ heroId: 1, reason: "taken" })],
    ["an upstream failure", err({ type: "unavailable" as const, cause: "timeout" })],
  ])("falls back to the top-scored candidate on %s", async (_n, result) => {
    const svc = new AiOpponentService({
      advisor: advisor(result),
      insights: insights({ 9: 0.56 }),
      heroes,
    });
    expect(await svc.move(direTurn, "dire")).toMatchObject({
      ok: true,
      value: { heroId: 9, source: "heuristic" },
    });
  });

  it("works with no model and no public data", async () => {
    const move = await new AiOpponentService({ advisor: null, insights: null, heroes }).move(
      start,
      "radiant",
    );
    expect(move).toMatchObject({ ok: true, value: { source: "heuristic", action: "ban" } });
  });

  it("forces a support once it has three cores (no Luna/Jugg/SF/4th core)", async () => {
    // Radiant (human) first pick; walk CM to Dire's 4th pick with Dire holding three cores.
    // Order: 7 bans, pick F S, 3 bans, pick S F F S S F, 4 bans, pick F S.
    const t = [
      31,
      32,
      33,
      34,
      35,
      36,
      37, // ban phase 1
      21,
      1, // pick F(radiant support), S(dire core)
      38,
      39,
      40, // ban phase 2
      2,
      22,
      23,
      3, // S core, F, F, S core
    ];
    // Next: step 17 is S (dire) pick with dire = 1, 2, 3 (three cores).
    const snap: DraftSnapshot = { ...start, t };
    const adv = advisor(ok({ heroId: 4, reason: "another carry" }));
    const move = await new AiOpponentService({
      advisor: adv,
      insights: insights({ 4: 0.6 }),
      heroes,
    }).move(snap, "dire");
    const req = adv.suggest.mock.calls[0][0];
    expect(req.situation).toContain("must pick a support");
    expect(req.candidates.every((c) => c.role === "support")).toBe(true);
    // The model's core pick is off-list, so the top support is used instead.
    expect(move.ok && move.value.heroId).toBeGreaterThan(20);
  });

  it("suggests data-ranked options for a human's turn without calling the model", async () => {
    const adv = advisor(ok({ heroId: 1, reason: "unused" }));
    const svc = new AiOpponentService({
      advisor: adv,
      insights: insights({ 12: 0.57, 5: 0.54 }),
      heroes,
    });
    const res = await svc.suggestions(start, "radiant");
    expect(res.ok && res.value.action).toBe("ban");
    expect(res.ok && res.value.candidates.map((c) => c.heroId).slice(0, 2)).toEqual([12, 5]);
    expect(res.ok && res.value.candidates).toHaveLength(5);
    expect(adv.suggest).not.toHaveBeenCalled();
    expect(await svc.suggestions(start, "dire")).toMatchObject({
      ok: false,
      error: { type: "not_ai_turn" },
    });
  });

  it("mixes cores and supports in pick suggestions when both roles are open", async () => {
    // Cores 1-20 have the best win rates; supports 21-40 are lower but still offered.
    const wr: Record<number, number> = {};
    for (let id = 1; id <= 40; id++) wr[id] = id <= 20 ? 0.56 : 0.51;
    const svc = new AiOpponentService({ advisor: null, insights: insights(wr), heroes });
    // Steps 1-7 are bans; step 8 is Radiant's first pick.
    const res = await svc.suggestions({ ...start, t: [31, 32, 33, 34, 35, 36, 37] }, "radiant");
    const roles = res.ok ? res.value.candidates.map((c) => c.role) : [];
    expect(res.ok && res.value.action).toBe("pick");
    expect(roles.filter((r) => r === "core")).toHaveLength(3);
    expect(roles.filter((r) => r === "support")).toHaveLength(2);
  });

  it("refuses to move on the human's turn or for a tampered draft", async () => {
    const svc = new AiOpponentService({ advisor: null, insights: null, heroes });
    expect(await svc.move(start, "dire")).toEqual({ ok: false, error: { type: "not_ai_turn" } });
    expect(await svc.move({ ...start, t: [1, 1] }, "dire")).toEqual({
      ok: false,
      error: { type: "invalid_snapshot" },
    });
  });
});

describe("GroqDraftAdvisor", () => {
  const req: AdvisorRequest = {
    action: "pick",
    side: "dire",
    stepNumber: 8,
    totalSteps: 24,
    ownPicks: [],
    ownBans: [],
    enemyPicks: [{ id: 1, name: "Magnus", roles: ["Initiator"] }],
    enemyBans: [],
    situation: "You have 0 cores and 0 supports, with 5 picks left.",
    candidates: [
      { id: 2, name: "Hero 2", role: "support", facts: ["52.0% win rate at high ranks"] },
    ],
  };
  const reply = (content: string, status = 200) =>
    vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
    );

  it("labels teams explicitly and sends the scored shortlist", async () => {
    const fetch = reply('{"heroId": 2, "reason": "Counters their Magnus."}');
    const adv = new GroqDraftAdvisor(new GroqClient({ apiKey: "k", fetch, retryDelayMs: 0 }), {
      model: "openai/gpt-oss-120b",
    });
    expect(await adv.suggest(req)).toEqual({
      ok: true,
      value: { heroId: 2, reason: "Counters their Magnus." },
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      reasoning_effort: "medium",
      response_format: { type: "json_object" },
    });
    expect(body.messages[1].content).toContain("OPPONENT picks: Magnus");
    expect(body.messages[1].content).toContain(
      "2: Hero 2 [support] - 52.0% win rate at high ranks",
    );
    expect(body.messages[0].content).toContain("Never call an opponent hero a teammate");
  });

  it("reports non-JSON, wrong shapes and HTTP errors as typed errors", async () => {
    const make = (f: (url: string, init: RequestInit) => Promise<Response>) =>
      new GroqDraftAdvisor(new GroqClient({ apiKey: "k", fetch: f, retryDelayMs: 0 }), {
        model: "m",
      });
    expect(await make(reply("not json")).suggest(req)).toMatchObject({
      ok: false,
      error: { type: "invalid_response" },
    });
    expect(await make(reply('{"hero":"Pudge"}')).suggest(req)).toMatchObject({
      ok: false,
      error: { type: "invalid_response" },
    });
    expect(await make(reply("{}", 429)).suggest(req)).toMatchObject({
      ok: false,
      error: { type: "unavailable" },
    });
  });
});
