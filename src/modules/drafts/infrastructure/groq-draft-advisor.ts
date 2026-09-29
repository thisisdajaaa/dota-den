import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type { AdvisorError, AdvisorHero, AdvisorRequest, DraftAdvisor } from "../application/ports";

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});
const AnswerSchema = z.object({
  heroId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(400),
});

const list = (heroes: readonly AdvisorHero[]): string =>
  heroes.length ? heroes.map((h) => h.name).join(", ") : "none";

/** Groq's OpenAI-compatible API (e.g. openai/gpt-oss-120b). */
export class GroqDraftAdvisor implements DraftAdvisor {
  constructor(
    private readonly opts: {
      apiKey: string;
      model: string;
      fetch?: (url: string, init: RequestInit) => Promise<Response>;
      timeoutMs?: number;
    },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  async suggest(
    req: AdvisorRequest,
  ): Promise<Result<{ heroId: number; reason: string }, AdvisorError>> {
    const system = [
      "You are the captain of one team in a Dota 2 Captain's Mode draft against a human.",
      "The server has already scored the legal options using current high-rank win rates and head-to-head matchup data.",
      "Choose exactly ONE hero id from the CANDIDATES list. Never choose anything else.",
      "Keep the two teams straight: YOUR TEAM are your heroes; OPPONENT heroes are the enemy. Never call an opponent hero a teammate or 'synergy'.",
      "Follow the SITUATION line: a lineup needs about 3 cores and 2 supports; if it says you must pick a support, pick a support.",
      "Prefer higher-listed candidates unless there's a clear draft reason (lane pairing, a counter, a combo with YOUR heroes).",
      'Reply with JSON only: {"heroId": <number>, "reason": "<one sentence, max 30 words, plain language, citing the data or your heroes>"}.',
    ].join(" ");
    const user = [
      `ACTION: ${req.action.toUpperCase()} (step ${req.stepNumber} of ${req.totalSteps}).`,
      `YOUR TEAM picks: ${list(req.ownPicks)}. Your bans: ${list(req.ownBans)}.`,
      `OPPONENT picks: ${list(req.enemyPicks)}. Opponent bans: ${list(req.enemyBans)}.`,
      `SITUATION: ${req.situation}`,
      req.action === "ban"
        ? "For a ban, deny the opponent a hero that beats YOUR picks or completes THEIR lineup."
        : "For a pick, strengthen YOUR lineup and punish the OPPONENT's picks.",
      "CANDIDATES (best first):",
      ...req.candidates.map((c) => `${c.id}: ${c.name} [${c.role}] - ${c.facts.join("; ")}`),
    ].join("\n");

    let content: string | null;
    try {
      const res = await (this.opts.fetch ?? fetch)(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.opts.model,
          reasoning_effort: "medium",
          temperature: 0.3,
          max_completion_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
      });
      if (!res.ok) return err({ type: "unavailable", cause: `status ${res.status}` });
      const parsed = CompletionSchema.safeParse(await res.json());
      if (!parsed.success) return err({ type: "invalid_response", cause: "completion shape" });
      content = parsed.data.choices[0].message.content;
    } catch (e) {
      return err({ type: "unavailable", cause: e instanceof Error ? e.name : "unknown" });
    }

    try {
      const answer = AnswerSchema.safeParse(JSON.parse(content ?? ""));
      return answer.success
        ? ok(answer.data)
        : err({ type: "invalid_response", cause: "answer shape" });
    } catch {
      return err({ type: "invalid_response", cause: "not json" });
    }
  }
}
