import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/common/errors/app-error";
import { GroqClient } from "@/common/llm/groq-client";
import { err, ok } from "@/common/result";
import { COACH_PROMPT_VERSION } from "@/modules/matches/domain/coach-facts";
import { GroqMatchCoach } from "@/modules/matches/infrastructure/groq-match-coach";
import { coachPrompt } from "@/modules/matches/infrastructure/prompts/coach.prompts";
import type {
  CoachReviewKey,
  CoachReviewsPort,
  CoachUsagePort,
  CoachWriter,
  StoredCoachReview,
} from "@/modules/matches/matches.ports";
import { CoachAnswerSchema } from "@/modules/matches/schemas/coach-review.schema";
import { MatchCoachService } from "@/modules/matches/services/match-coach.service";
import { ITEMS, ME, parsedMatch, SHEET } from "../support/coach-fixtures";

const NOW = new Date("2026-10-23T12:00:00Z");
const USER = { id: "a".repeat(24), accountId32: ME };
const MODEL = "test/model";

/** A grounded answer for parsedMatch(): it only quotes the sheet's numbers. */
const GOOD = {
  points: [
    {
      kind: "strength",
      title: "Clean lane",
      detail: "50 last hits by minute 10 is solid.",
      facts: ["lastHitsAt10"],
    },
    {
      kind: "improve",
      title: "Faster Battle Fury",
      detail: "Battle Fury came at 18:20; stack a camp first.",
      facts: ["item.bfury"],
    },
    {
      kind: "improve",
      title: "Die less in fights",
      detail: "You died 3 times. Wait for your team.",
      facts: ["deaths"],
    },
  ],
};

class MemoryReviews implements CoachReviewsPort {
  readonly docs = new Map<string, StoredCoachReview>();
  id = (k: CoachReviewKey) =>
    `${k.matchId}:${k.accountId32}:${k.model}:${k.promptVersion}:${k.locale}`;
  async get(k: CoachReviewKey) {
    return this.docs.get(this.id(k)) ?? null;
  }
  async save(r: StoredCoachReview) {
    const existing = this.docs.get(this.id(r));
    if (existing) return existing;
    this.docs.set(this.id(r), r);
    return r;
  }
  async exportForOwner() {
    return [...this.docs.values()] as unknown as Record<string, unknown>[];
  }
  async deleteForOwner() {
    const n = this.docs.size;
    this.docs.clear();
    return n;
  }
}

class MemoryUsage implements CoachUsagePort {
  readonly rows: Array<{ id: string; userId: string; status: "held" | "used"; at: Date }> = [];
  private seq = 0;
  async usesSince(userId: string, since: Date) {
    return this.rows
      .filter((r) => r.userId === userId && r.status === "used" && r.at > since)
      .map((r) => r.at);
  }
  async reserve(userId: string, opts: { now: Date; limit: number; windowMs: number }) {
    const since = opts.now.getTime() - opts.windowMs;
    const taken = this.rows.filter(
      (r) => r.userId === userId && (r.status === "held" || r.at.getTime() > since),
    ).length;
    if (taken >= opts.limit) return { ok: false as const };
    const id = String(++this.seq);
    this.rows.push({ id, userId, status: "held", at: opts.now });
    return { ok: true as const, id };
  }
  async confirm(id: string, now: Date) {
    const r = this.rows.find((x) => x.id === id)!;
    r.status = "used";
    r.at = now;
  }
  async release(id: string) {
    const i = this.rows.findIndex((x) => x.id === id && x.status === "held");
    if (i >= 0) this.rows.splice(i, 1);
  }
  async exportForOwner() {
    return [];
  }
  async deleteForOwner() {
    return 0;
  }
}

function make(
  opts: {
    replies?: unknown[];
    plus?: boolean;
    budget?: boolean[];
    match?: ReturnType<typeof parsedMatch>;
    writer?: CoachWriter | null;
  } = {},
) {
  const replies = [...(opts.replies ?? [GOOD])];
  const write = vi.fn(async () => {
    const next = replies.shift();
    if (next instanceof Error) return err({ type: "unavailable" as const, cause: next.message });
    if (next === "not json") return err({ type: "invalid_response" as const, cause: "not json" });
    return ok(next);
  });
  const budgetAnswers = [...(opts.budget ?? [])];
  const take = vi.fn(async () => budgetAnswers.shift() ?? true);
  const reviews = new MemoryReviews();
  const usage = new MemoryUsage();
  const service = new MatchCoachService({
    matches: {
      match: async () => ok(opts.match ?? parsedMatch()),
      heroMap: async () => new Map([[1, { id: 1, name: "Anti-Mage" } as never]]),
      itemMap: async () => new Map(ITEMS.map((i) => [i.id, i])),
    },
    patches: {
      getTimeline: async () => ok([{ name: "7.41", releasedAt: new Date("2026-09-01") }]),
    },
    reviews,
    usage,
    isPlus: async () => opts.plus ?? false,
    writer: opts.writer === undefined ? { model: MODEL, write } : opts.writer,
    budget: { take },
    logger: { info: () => {}, warn: () => {} },
    now: () => NOW,
  });
  return { service, write, take, reviews, usage };
}

async function reason(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError)
      return (e.details as { reason?: string } | undefined)?.reason ?? e.code;
    throw e;
  }
  return undefined;
}

describe("coach prompt and answer schema", () => {
  it("gives the model the facts, what's missing, and the rules", () => {
    const { system, user } = coachPrompt(SHEET, { locale: "en" });
    expect(system).toMatch(/based ONLY on the FACTS/);
    expect(system).toMatch(/Never invent/);
    expect(system).toMatch(/never call the player solo/);
    expect(user).toContain("lastHitsAt10 | Last hits at 10:00 | 48");
    expect(user).toContain("item.bfury | Battle Fury bought at (game clock) | 18:23");
    expect(user).toMatch(/MISSING .*unknown, NOT solo.*percentiles/);
    const retry = coachPrompt(SHEET, {
      locale: "en",
      problems: ["Point 1 uses numbers that are not in FACTS: 70."],
    });
    expect(retry.user).toMatch(/previous answer was rejected:\n- Point 1 uses numbers/);
  });

  it("asks for the viewer's language, keeping names and numbers as given", () => {
    const fil = coachPrompt(SHEET, { locale: "fil" });
    expect(fil.user).toContain("LANGUAGE: fil (Filipino");
    expect(fil.system).toMatch(/Write the title and detail in Filipino/);
    expect(fil.system).toMatch(/Keep hero names, item names, .* every number exactly as given/);
    expect(coachPrompt(SHEET, { locale: "ceb" }).user).toContain("LANGUAGE: ceb (Cebuano");
    expect(coachPrompt(SHEET, { locale: "en" }).system).toMatch(/in English\./);
    // Small numbers need a fact; only time markers don't.
    expect(fil.system).toMatch(/small counts included/);
    expect(fil.system).toMatch(/only numbers that need no fact are minute markers/);
    expect(fil.system).toMatch(/A clock time like 18:20 is a stat/);
  });

  it("accepts the documented shape and rejects others", () => {
    expect(CoachAnswerSchema.safeParse(GOOD).success).toBe(true);
    expect(CoachAnswerSchema.safeParse({ points: [] }).success).toBe(false);
    expect(
      CoachAnswerSchema.safeParse({ points: [{ ...GOOD.points[0], kind: "praise" }] }).success,
    ).toBe(false);
    expect(CoachAnswerSchema.safeParse({ summary: "Good game" }).success).toBe(false);
  });

  it("the Groq adapter asks for JSON once (the service does the retry) and returns it raw", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(GOOD) } }] }),
          { status: 200 },
        ),
    );
    const coach = new GroqMatchCoach(new GroqClient({ apiKey: "k", fetch, retryDelayMs: 0 }), {
      model: MODEL,
    });
    const res = await coach.write(SHEET, { locale: "en" });
    expect(res).toEqual(ok(GOOD));
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({ model: MODEL, response_format: { type: "json_object" } });
    const bad = new GroqMatchCoach(
      new GroqClient({
        apiKey: "k",
        fetch: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "Sure! Here" } }] })),
        retryDelayMs: 0,
      }),
      { model: MODEL },
    );
    expect(await bad.write(SHEET, { locale: "en" })).toEqual(
      err({ type: "invalid_response", cause: "not json" }),
    );
  });
});

describe("MatchCoachService", () => {
  it("writes a review from the fact sheet, stores it and counts the free use", async () => {
    const { service, write, reviews, usage } = make();
    const res = await service.review(USER, "7000000012", "en");
    expect(res.cached).toBe(false);
    expect(res.review.points).toHaveLength(3);
    // Each point carries our numbers for the facts it cites.
    expect(res.review.points[0].facts).toEqual([
      { key: "lastHitsAt10", base: "lastHitsAt10", subject: null, value: 50, unit: "count" },
    ]);
    expect(res.review.missing).toEqual(["party"]);
    expect(res.quota).toEqual({
      plan: "free",
      limit: 1,
      remaining: 0,
      resetsAt: "2026-10-30T12:00:00.000Z",
    });
    expect(write).toHaveBeenCalledTimes(1);
    const [stored] = reviews.docs.values();
    expect(stored).toMatchObject({
      model: MODEL,
      promptVersion: COACH_PROMPT_VERSION,
      userId: USER.id,
    });
    expect(usage.rows).toEqual([expect.objectContaining({ status: "used", at: NOW })]);
  });

  it("writes in the viewer's language; another language is a new (counted) review", async () => {
    const { service, write, usage, reviews } = make({ plus: false, replies: [GOOD, GOOD] });
    const fil = await service.review(USER, "7000000012", "fil");
    expect(fil.review.locale).toBe("fil");
    expect(write.mock.calls[0]).toEqual([expect.anything(), { locale: "fil", problems: [] }]);
    expect([...reviews.docs.keys()][0]).toMatch(/:fil$/);
    // The same match in English isn't stored yet: it's a new review, and the free one is used.
    expect(await reason(service.review(USER, "7000000012", "en"))).toBe("quota");
    expect(usage.rows).toHaveLength(1);
    // With Plus, both languages are kept side by side.
    const plus = make({ plus: true, replies: [GOOD, GOOD] });
    await plus.service.review(USER, "7000000012", "fil");
    const en = await plus.service.review(USER, "7000000012", "en");
    expect(en.cached).toBe(false);
    expect(plus.reviews.docs.size).toBe(2);
    expect((await plus.service.review(USER, "7000000012", "fil")).cached).toBe(true);
  });

  it("re-shows a stored review without a model call or a quota use", async () => {
    const { service, write, usage } = make();
    await service.review(USER, "7000000012", "en");
    const again = await service.review(USER, "7000000012", "en");
    expect(again.cached).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(usage.rows).toHaveLength(1);
  });

  it("retries once with the problems when the answer is invalid, then succeeds", async () => {
    const invented = {
      points: GOOD.points.map((p, i) =>
        i === 0 ? { ...p, detail: "Pros get 70 last hits by minute 10." } : p,
      ),
    };
    const { service, write, take } = make({ replies: [invented, GOOD] });
    const res = await service.review(USER, "7000000012", "en");
    expect(res.review.points[0].detail).toBe("50 last hits by minute 10 is solid.");
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual([
      expect.anything(),
      { locale: "en", problems: ["Point 1 uses numbers that are not in FACTS: 70."] },
    ]);
    expect(take).toHaveBeenCalledTimes(2);
  });

  it("retries invalid JSON once, then gives up gracefully without counting", async () => {
    const { service, write, usage, reviews } = make({
      replies: ["not json", { summary: "gg" }, GOOD],
    });
    expect(await reason(service.review(USER, "7000000012", "en"))).toBe("failed");
    expect(write).toHaveBeenCalledTimes(2);
    expect(usage.rows).toEqual([]);
    expect(reviews.docs.size).toBe(0);
    // The held slot was given back: the next attempt can still use it.
    expect((await service.review(USER, "7000000012", "en")).cached).toBe(false);
    expect(usage.rows).toHaveLength(1);
  });

  it("doesn't retry when the model is down (and nothing is counted)", async () => {
    const { service, write, usage } = make({ replies: [new Error("timeout")] });
    expect(await reason(service.review(USER, "7000000012", "en"))).toBe("failed");
    expect(write).toHaveBeenCalledTimes(1);
    expect(usage.rows).toEqual([]);
  });

  it("says the coach is resting when the daily budget is spent, without counting", async () => {
    const { service, write, usage } = make({ budget: [false] });
    expect(await reason(service.review(USER, "7000000012", "en"))).toBe("resting");
    expect(write).not.toHaveBeenCalled();
    expect(usage.rows).toEqual([]);
    // Spent between the first answer and the retry: still resting, still nothing counted.
    const mid = make({ budget: [true, false], replies: ["not json"] });
    expect(await reason(mid.service.review(USER, "7000000012", "en"))).toBe("resting");
    expect(mid.usage.rows).toEqual([]);
  });

  it("refuses a second free review within the window, with the quota", async () => {
    const { service, usage } = make();
    await service.review(USER, "7000000012", "en");
    let details: unknown;
    try {
      await service.review(USER, "7000000099", "en");
    } catch (e) {
      details = (e as AppError).details;
      expect((e as AppError).statusCode).toBe(429);
    }
    expect(details).toEqual({
      reason: "quota",
      quota: { plan: "free", limit: 1, remaining: 0, resetsAt: "2026-10-30T12:00:00.000Z" },
    });
    expect(usage.rows).toHaveLength(1);
  });

  it("is unlimited with Plus and records no free uses", async () => {
    const { service, usage } = make({ plus: true, replies: [GOOD, GOOD, GOOD] });
    for (const id of ["7000000012", "7000000013", "7000000014"]) {
      const res = await service.review(USER, id, "en");
      expect(res.quota).toEqual({ plan: "plus", limit: null, remaining: null, resetsAt: null });
    }
    expect(usage.rows).toEqual([]);
  });

  it("only reviews your own parsed matches, and is off without a model", async () => {
    const other = make();
    expect(
      await reason(other.service.review({ ...USER, accountId32: 1 }, "7000000012", "en")),
    ).toBe("forbidden");
    const unparsed = make({ match: parsedMatch({ parsed: false }) });
    expect(await reason(unparsed.service.review(USER, "7000000012", "en"))).toBe("unparsed");
    expect(unparsed.write).not.toHaveBeenCalled();
    expect(unparsed.usage.rows).toEqual([]);
    const off = make({ writer: null });
    expect(await reason(off.service.review(USER, "7000000012", "en"))).toBe("not_configured");
  });

  it("starts the match page card in the right state", async () => {
    const match = parsedMatch();
    const { service } = make();
    expect(await service.view({ ...USER, accountId32: 1 }, match, "en")).toBeNull();
    expect(await service.view(USER, match, "en")).toEqual({
      status: "available",
      quota: { plan: "free", limit: 1, remaining: 1, resetsAt: null },
    });
    expect(await service.view(USER, parsedMatch({ parsed: false }), "en")).toEqual({
      status: "unparsed",
    });
    await service.review(USER, match.matchId, "en");
    expect(await service.view(USER, match, "en")).toMatchObject({ status: "ready" });
    expect(await service.view(USER, { ...match, matchId: "7000000099" }, "en")).toMatchObject({
      status: "locked",
      quota: { remaining: 0 },
    });
    expect(await make({ writer: null }).service.view(USER, match, "en")).toEqual({ status: "off" });
  });
});
