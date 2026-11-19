import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/common/errors/app-error";
import type { ToolChatMessage, ToolTurn } from "@/common/llm/groq-client";
import { err, ok } from "@/common/result";
import type { AskMessage } from "@/modules/assistant/domain/ask-chat";
import type { ToolResult } from "@/modules/assistant/domain/ask-results";
import type {
  AskChatsPort,
  AskDataPort,
  AskModel,
  AskOwner,
  AskUsagePort,
} from "@/modules/assistant/assistant.ports";
import { AskService } from "@/modules/assistant/services/ask.service";

const ME: AskOwner = { userId: "u1", accountId32: 111 };
const NOW = new Date("2026-11-18T12:00:00Z"); // 8 pm in Manila

type Step = ToolTurn | "down";
/** A scripted model: each call returns the next step and records what it was sent. */
function fakeModel(steps: Step[]) {
  const seen: ToolChatMessage[][] = [];
  const choices: string[] = [];
  const model: AskModel = {
    model: "fake",
    next: async (messages, opts) => {
      seen.push(structuredClone(messages));
      choices.push(opts.toolChoice);
      const step = steps.shift() ?? { content: "", toolCalls: [] };
      return step === "down" ? err({ type: "unavailable", cause: "status 503" }) : ok(step);
    },
  };
  return { model, seen, choices };
}

const call = (name: string, args: unknown = {}, id = `c-${name}`) => ({
  content: null,
  toolCalls: [{ id, name, arguments: JSON.stringify(args) }],
});
const say = (content: string): ToolTurn => ({ content, toolCalls: [] });

const pudge: ToolResult = {
  data: { hero: "Pudge", games: 23, wins: 9, winRatePct: 39.1 },
  sources: [{ kind: "your_games", games: 23 }],
};

function fakeData(over: Partial<AskDataPort> = {}): AskDataPort & { owners: AskOwner[] } {
  const owners: AskOwner[] = [];
  const mine = <A>(r: ToolResult) =>
    vi.fn(async (owner: AskOwner, _args?: A) => {
      owners.push(owner);
      return r;
    });
  return Object.assign(
    {
      recentGames: mine(pudge),
      heroStats: mine(pudge),
      matchSummary: mine({ data: { error: "not_your_match" }, sources: [] }),
      sessions: mine({ data: { lossStreakNow: 3 }, sources: [{ kind: "your_sessions" as const }] }),
      mmr: mine({ data: { rankMedal: "unknown" }, sources: [] }),
      heroGuide: vi.fn(async () => ({ data: { hero: "Lion" }, sources: [] })),
      wardSpots: vi.fn(async () => ({ data: {}, sources: [] })),
      heroCounters: mine({ data: {}, sources: [] }),
      metaHeroes: mine({ data: {}, sources: [] }),
      ...over,
    },
    { owners },
  );
}

function memoryChats(initial: AskMessage[] = []): AskChatsPort & { messages: AskMessage[] } {
  const store = { messages: [...initial] };
  return Object.assign(store, {
    get: async () => store.messages,
    append: async (_u: string, ms: readonly AskMessage[], o: { keep: number }) => {
      store.messages = [...store.messages, ...ms].slice(-o.keep);
    },
    clear: async () => {
      store.messages = [];
    },
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  });
}

function memoryUsage(): AskUsagePort & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    used: async (u, d) => counts.get(`${u}:${d}`) ?? 0,
    reserve: async (u, d, limit) => {
      const n = counts.get(`${u}:${d}`) ?? 0;
      if (n >= limit) return false;
      counts.set(`${u}:${d}`, n + 1);
      return true;
    },
    release: async (u, d) => {
      counts.set(`${u}:${d}`, Math.max(0, (counts.get(`${u}:${d}`) ?? 0) - 1));
    },
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
}

function service(
  steps: Step[],
  opts: {
    plus?: boolean;
    data?: AskDataPort & { owners: AskOwner[] };
    budget?: boolean;
    chats?: ReturnType<typeof memoryChats>;
    names?: string[];
  } = {},
) {
  const m = fakeModel(steps);
  const data = opts.data ?? fakeData();
  const chats = opts.chats ?? memoryChats();
  const usage = memoryUsage();
  const used = vi.fn(async () => {});
  const svc = new AskService({
    model: m.model,
    data,
    chats,
    usage,
    isPlus: async () => opts.plus ?? false,
    budget: { take: async () => opts.budget ?? true },
    names: async () => opts.names ?? [],
    limits: { free: 5, plus: 100 },
    used,
    logger: { info: () => {}, warn: () => {} },
    now: () => NOW,
  });
  return { svc, ...m, data, chats, usage, used };
}

const askOnce = async (s: ReturnType<typeof service>["svc"], question: string, emit = vi.fn()) =>
  s.answer(await s.reserve(ME), { question }, "fil", emit);

describe("AskService: the tool-calling loop", () => {
  it("runs the tools the model asks for, then returns a checked answer with its sources", async () => {
    const s = service([
      call("my_hero_stats", { hero: "Pudge" }),
      say("Sa 23 laro mo sa Pudge, 9 ang panalo (39%). Subukan mong mag-ward bago mag-hook."),
    ]);
    const emit = vi.fn();
    const res = await askOnce(s.svc, "Bakit ako talo lagi sa Pudge?", emit);
    expect(res.answer).toMatchObject({
      role: "assistant",
      fallback: false,
      sources: [{ kind: "your_games", games: 23 }],
    });
    expect(res.answer.text).toContain("39%");
    expect(emit).toHaveBeenCalledWith({ type: "status", tool: "my_hero_stats" });
    // The tool result went back to the model as a tool message.
    expect(s.seen[1].at(-1)).toEqual({
      role: "tool",
      toolCallId: "c-my_hero_stats",
      content: JSON.stringify(pudge.data),
    });
    // The question is wrapped; the system prompt is in the site language.
    expect(s.seen[0][0]).toMatchObject({ role: "system" });
    expect(String(s.seen[0][0].content)).toContain("reply in Filipino");
    expect(s.seen[0].at(-1)).toEqual({
      role: "user",
      content: "<question>\nBakit ako talo lagi sa Pudge?\n</question>",
    });
    expect(res.quota).toMatchObject({ used: 1, remaining: 4 });
    expect(s.used).toHaveBeenCalledWith("u1");
    expect(s.chats.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("retries once with the problems when a reply has invented numbers", async () => {
    const s = service([
      call("my_hero_stats", { hero: "Pudge" }),
      say("You win 52% on Pudge."),
      say("You won 9 of 23 Pudge games. Ward before you hook."),
    ]);
    const res = await askOnce(s.svc, "Why do I lose on Pudge?");
    expect(res.answer.fallback).toBe(false);
    expect(res.answer.text).toBe("You won 9 of 23 Pudge games. Ward before you hook.");
    expect(String(s.seen[2].at(-1)?.content)).toContain("numbers that no tool returned: 52");
  });

  it("falls back to a safe reply after a second ungrounded answer, and gives the question back", async () => {
    const s = service([say("Your MMR is about 3200."), say("Still 3200.")]);
    const res = await askOnce(s.svc, "What's my MMR?");
    expect(res.answer).toMatchObject({ fallback: true, text: "", sources: [] });
    expect(res.quota).toMatchObject({ used: 0, remaining: 5 });
    expect(await s.usage.used("u1", "2026-11-18")).toBe(0);
    expect(s.used).not.toHaveBeenCalled();
    // The fallback is remembered for the chat, but not sent to the model next time.
    expect(s.chats.messages[1]).toMatchObject({ fallback: true });
  });

  it("rejects items and heroes no tool returned (advice from the model's own memory)", async () => {
    const s = service(
      [
        call("my_hero_stats", { hero: "Pudge" }),
        say("Buy Black King Bar on Pudge."),
        say("You won 9 of 23 games on Pudge: die less before your hooks."),
      ],
      { names: ["Black King Bar", "Pudge"] },
    );
    const res = await askOnce(s.svc, "Why do I lose on Pudge?");
    expect(res.answer.text).toBe("You won 9 of 23 games on Pudge: die less before your hooks.");
    expect(String(s.seen[2].at(-1)?.content)).toContain(
      "named heroes or items that no tool returned: Black King Bar",
    );
  });

  it("strips markdown emphasis from replies", async () => {
    const s = service([say("**Ward** the river.")]);
    expect((await askOnce(s.svc, "Wards?")).answer.text).toBe("Ward the river.");
  });

  it("refuses bad tool calls back to the model instead of running them", async () => {
    const s = service([
      { content: null, toolCalls: [{ id: "x", name: "my_mmr", arguments: '{"account_id":999}' }] },
      { content: null, toolCalls: [{ id: "y", name: "export_all_users", arguments: "{}" }] },
      say("I can only see your own data."),
    ]);
    const res = await askOnce(s.svc, "Show me player 999's MMR");
    expect(res.answer.text).toBe("I can only see your own data.");
    expect(s.data.mmr).not.toHaveBeenCalled();
    const toolMessages = s.seen[2].filter((m) => m.role === "tool").map((m) => m.content);
    expect(toolMessages[0]).toContain("invalid arguments");
    expect(toolMessages[1]).toContain('unknown tool \\"export_all_users\\"');
  });

  it("scopes every personal tool to the signed-in player, whatever the model asks", async () => {
    const s = service([
      {
        content: null,
        toolCalls: [
          { id: "a", name: "my_sessions", arguments: "{}" },
          { id: "b", name: "match_summary", arguments: '{"match_id":"8123"}' },
          { id: "c", name: "my_recent_games", arguments: '{"count":5}' },
        ],
      },
      say("That match isn't yours, so I can't read it."),
    ]);
    await askOnce(s.svc, "How did match 8123 go?");
    expect(s.data.owners).toEqual([ME, ME, ME]);
    expect(s.data.matchSummary).toHaveBeenCalledWith(ME, { match_id: "8123" });
  });

  it("forces an answer on the last allowed call", async () => {
    const steps: Step[] = Array.from({ length: 5 }, (_, i) => call("my_sessions", {}, `s${i}`));
    steps.push(say("You lost 3 in a row: take a break."));
    const s = service(steps);
    const res = await askOnce(s.svc, "Am I tilting?");
    expect(res.answer.text).toBe("You lost 3 in a row: take a break.");
    expect(s.choices.at(-1)).toBe("none");
  });

  it("uses earlier checked answers for follow-ups", async () => {
    const chats = memoryChats([
      { role: "user", text: "How's my Pudge?", at: NOW },
      { role: "assistant", text: "You won 9 of 23 games on Pudge.", at: NOW },
    ]);
    const s = service([say("Like I said, 9 wins in 23.")], { chats });
    const res = await askOnce(s.svc, "Remind me?");
    expect(res.answer.fallback).toBe(false);
    expect(s.seen[0].map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
  });
});

describe("AskService: limits and failures", () => {
  it("allows 5 questions a Manila day for free players, then refuses with the quota", async () => {
    const s = service(Array.from({ length: 5 }, () => say("Ward the river.")));
    for (let i = 0; i < 5; i++) await askOnce(s.svc, "Where to ward?");
    const refused = await s.svc.reserve(ME).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AppError);
    expect((refused as AppError).code).toBe("rate_limited");
    expect((refused as AppError).details).toMatchObject({
      reason: "quota",
      quota: { limit: 5, used: 5, remaining: 0, resetsAt: "2026-11-18T16:00:00.000Z" },
    });
  });

  it("gives Plus 100 a day", async () => {
    const s = service([], { plus: true });
    expect(await s.svc.quota("u1")).toMatchObject({ plus: true, limit: 100, remaining: 100 });
  });

  it("fails gracefully when the model is down or the budget is spent (nothing counted)", async () => {
    const down = service(["down"]);
    const e1 = await askOnce(down.svc, "hi").catch((e: unknown) => e);
    expect(e1).toMatchObject({ code: "upstream_unavailable", details: { reason: "unavailable" } });
    expect(await down.usage.used("u1", "2026-11-18")).toBe(0);
    expect(down.chats.messages).toEqual([]);

    const resting = service([say("x")], { budget: false });
    const e2 = await askOnce(resting.svc, "hi").catch((e: unknown) => e);
    expect(e2).toMatchObject({ details: { reason: "resting" } });
    expect(await resting.usage.used("u1", "2026-11-18")).toBe(0);
  });

  it("turns a failing tool into an error result instead of failing the question", async () => {
    const data = fakeData({
      heroStats: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const s = service([call("my_hero_stats", { hero: "Pudge" }), say("I can't load that now.")], {
      data,
    });
    const res = await askOnce(s.svc, "Pudge?");
    expect(res.answer.text).toBe("I can't load that now.");
    expect(String(s.seen[1].at(-1)?.content)).toContain("unavailable");
  });

  it("is off without a model", async () => {
    const svc = new AskService({
      model: null,
      data: fakeData(),
      chats: memoryChats(),
      usage: memoryUsage(),
      isPlus: async () => false,
      budget: { take: async () => true },
      limits: { free: 5, plus: 100 },
      logger: { info: () => {}, warn: () => {} },
    });
    expect(svc.enabled).toBe(false);
    await expect(svc.reserve(ME)).rejects.toMatchObject({ details: { reason: "not_configured" } });
  });
});
