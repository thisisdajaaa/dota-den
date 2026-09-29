import { z } from "zod";
import { err, ok, type Result } from "@/modules/shared/domain/result";
import type { AdvisorError, AdvisorHero, AdvisorRequest, DraftAdvisor } from "../application/ports";

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});
const AnswerSchema = z.object({
  heroId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(300),
});

const list = (heroes: readonly AdvisorHero[]): string =>
  heroes.length ? heroes.map((h) => h.name).join(", ") : "none";

/** Groq's OpenAI-compatible API (e.g. openai/gpt-oss-120b). */
export class GroqDraftAdvisor implements DraftAdvisor {
  constructor(
    private readonly opts: {
      apiKey: string;
      model: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  async suggest(
    req: AdvisorRequest,
  ): Promise<Result<{ heroId: number; reason: string }, AdvisorError>> {
    const system =
      "You are an expert Dota 2 captain drafting in Captain's Mode against a human. " +
      "Choose exactly one hero id from the AVAILABLE list for the current action. " +
      'Reply with JSON only: {"heroId": <number>, "reason": "<one short sentence, plain language, max 25 words>"}. ' +
      "For picks, build a coherent lineup (lanes, control, damage mix, a win condition). " +
      "For bans, deny the strongest options for the enemy given their picks, or strong flexible heroes early.";
    const user = [
      `Action: ${req.action.toUpperCase()} for ${req.side} (step ${req.stepNumber} of ${req.totalSteps}).`,
      `Our picks: ${list(req.ownPicks)}. Our bans: ${list(req.ownBans)}.`,
      `Enemy picks: ${list(req.enemyPicks)}. Enemy bans: ${list(req.enemyBans)}.`,
      "AVAILABLE (id: name [roles]):",
      ...req.available.map((h) => `${h.id}: ${h.name} [${h.roles.join(", ")}]`),
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
          reasoning_effort: "low",
          temperature: 0.7,
          max_completion_tokens: 600,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 12_000),
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
