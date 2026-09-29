import { describe, expect, it, vi } from "vitest";
import { AiOpponentService, type AiHero } from "@/modules/drafts/application/ai-opponent-service";
import type { DraftAdvisor } from "@/modules/drafts/application/ports";
import type { DraftSnapshot } from "@/modules/drafts/application/snapshot";
import { GroqDraftAdvisor } from "@/modules/drafts/infrastructure/groq-draft-advisor";
import { err, ok } from "@/modules/shared/domain/result";

const heroes: AiHero[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  name: `Hero ${i + 1}`,
  roles: i % 2 ? ["Support", "Disabler"] : ["Carry"],
  attackType: i % 3 ? "Ranged" : "Melee",
  primaryAttr: "str",
}));

// cm-2026 step 1 is a ban by the first-pick team (radiant here); step 3 is dire's ban.
const start: DraftSnapshot = { v: 1, r: "cm-2026", rv: 1, f: "radiant", t: [] };
const direTurn: DraftSnapshot = { ...start, t: [1, 2] };

function advisor(result: Awaited<ReturnType<DraftAdvisor["suggest"]>>): DraftAdvisor {
  return { model: "test-model", suggest: vi.fn(async () => result) };
}

describe("AiOpponentService", () => {
  it("uses a legal model suggestion", async () => {
    const svc = new AiOpponentService({
      advisor: advisor(ok({ heroId: 7, reason: "Deny their carry." })),
      heroes,
    });
    expect(await svc.move(direTurn, "dire")).toEqual({
      ok: true,
      value: {
        action: "ban",
        side: "dire",
        heroId: 7,
        reason: "Deny their carry.",
        source: "model",
        model: "test-model",
      },
    });
  });

  it.each([
    ["an unavailable hero", ok({ heroId: 1, reason: "already banned" })],
    ["a hero outside the pool", ok({ heroId: 999, reason: "made up" })],
    ["an upstream failure", err({ type: "unavailable" as const, cause: "timeout" })],
  ])("falls back to the heuristic on %s", async (_name, result) => {
    const svc = new AiOpponentService({ advisor: advisor(result), heroes });
    const move = await svc.move(direTurn, "dire");
    expect(move.ok && move.value.source).toBe("heuristic");
    expect(move.ok && [1, 2].includes(move.value.heroId)).toBe(false);
  });

  it("works without any model configured", async () => {
    const move = await new AiOpponentService({ advisor: null, heroes }).move(start, "radiant");
    expect(move).toMatchObject({ ok: true, value: { source: "heuristic", action: "ban" } });
  });

  it("refuses to move on the human's turn or for a tampered draft", async () => {
    const svc = new AiOpponentService({ advisor: null, heroes });
    expect(await svc.move(start, "dire")).toEqual({ ok: false, error: { type: "not_ai_turn" } });
    expect(await svc.move({ ...start, t: [1, 1] }, "dire")).toEqual({
      ok: false,
      error: { type: "invalid_snapshot" },
    });
  });
});

describe("GroqDraftAdvisor", () => {
  const req = {
    action: "pick" as const,
    side: "dire" as const,
    stepNumber: 8,
    totalSteps: 24,
    ownPicks: [],
    ownBans: [],
    enemyPicks: [{ id: 1, name: "Hero 1", roles: ["Carry"] }],
    enemyBans: [],
    available: [{ id: 2, name: "Hero 2", roles: ["Support"] }],
  };
  const reply = (content: string, status = 200) =>
    vi.fn(
      async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
    );

  it("sends the model, JSON mode and the available list, and parses the answer", async () => {
    const fetch = reply('{"heroId": 2, "reason": "Save for our carry."}');
    const advisor = new GroqDraftAdvisor({ apiKey: "k", model: "openai/gpt-oss-120b", fetch });
    expect(await advisor.suggest(req)).toEqual({
      ok: true,
      value: { heroId: 2, reason: "Save for our carry." },
    });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      response_format: { type: "json_object" },
    });
    expect(body.messages[1].content).toContain("2: Hero 2 [Support]");
  });

  it("reports non-JSON, wrong shapes and HTTP errors as typed errors", async () => {
    const make = (f: typeof fetch) => new GroqDraftAdvisor({ apiKey: "k", model: "m", fetch: f });
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
