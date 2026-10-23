import { z } from "zod";
import type { GroqClient } from "@/common/llm/groq-client";
import type { Result } from "@/common/result";
import type { CoachFactSheet, CoachLocale } from "../domain/coach-facts";
import type { CoachWriter, CoachWriterError } from "../matches.ports";
import { coachPrompt } from "./prompts/coach.prompts";

/** The AI match coach on Groq. Returns the model's JSON unvalidated; the service checks it. */
export class GroqMatchCoach implements CoachWriter {
  constructor(
    private readonly client: GroqClient,
    private readonly opts: { model: string; timeoutMs?: number },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  write(
    sheet: CoachFactSheet,
    opts: { locale: CoachLocale; problems?: readonly string[] },
  ): Promise<Result<unknown, CoachWriterError>> {
    const { system, user } = coachPrompt(sheet, opts);
    return this.client.chatJson(
      z.unknown(),
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.opts.model,
        reasoningEffort: "medium",
        temperature: 0.2,
        maxTokens: 2500,
        timeoutMs: this.opts.timeoutMs ?? 25_000,
        // The service retries once itself (with the problems), so no transport retry here.
        retries: 0,
      },
    );
  }
}
