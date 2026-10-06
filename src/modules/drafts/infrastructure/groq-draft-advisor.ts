import { z } from "zod";
import type { GroqClient } from "@/common/llm/groq-client";
import { ok, type Result } from "@/common/result";
import type {
  AdvisorError,
  AdvisorRequest,
  DraftAdvisor,
  DraftReviewer,
  ReviewRequest,
} from "../drafts.ports";
import { movePrompt, reviewPrompt } from "./prompts/draft.prompts";

const AnswerSchema = z.object({
  heroId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1).max(400),
});

/** The AI captain and draft reviewer on Groq (e.g. openai/gpt-oss-120b). */
export class GroqDraftAdvisor implements DraftAdvisor, DraftReviewer {
  constructor(
    private readonly client: GroqClient,
    private readonly opts: {
      model: string;
      /** Timeout for one AI captain move (default 15s). */
      moveTimeoutMs?: number;
      /** Timeout for one draft review, a longer answer (default 30s). */
      reviewTimeoutMs?: number;
    },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  async suggest(
    req: AdvisorRequest,
  ): Promise<Result<{ heroId: number; reason: string }, AdvisorError>> {
    const { system, user } = movePrompt(req);
    return this.client.chatJson(
      AnswerSchema,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.opts.model,
        reasoningEffort: "medium",
        temperature: 0.3,
        maxTokens: 1500,
        timeoutMs: this.opts.moveTimeoutMs ?? 15_000,
        // A move has a player waiting: no retry, the rule-based pick takes over instead.
        retries: 0,
      },
    );
  }

  /** Review a finished draft. Returns the model's JSON unvalidated; the caller validates it. */
  async review(req: ReviewRequest): Promise<Result<unknown, AdvisorError>> {
    const { system, user } = reviewPrompt(req);
    const res = await this.client.chatJson(
      z.unknown(),
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.opts.model,
        reasoningEffort: "medium",
        temperature: 0.2,
        maxTokens: 3000,
        timeoutMs: this.opts.reviewTimeoutMs ?? 30_000,
        retries: 0,
      },
    );
    return res.ok ? ok(res.value) : res;
  }
}
