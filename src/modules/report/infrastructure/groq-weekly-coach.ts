import { z } from "zod";
import type { GroqClient } from "@/common/llm/groq-client";
import type { GroundFact } from "@/common/utils/grounding";
import type { Result } from "@/common/result";
import type { ReadLocale } from "../domain/period-read";
import type { PeriodReaderError, WeeklyCoachWriter } from "../report.ports";
import { weeklyCoachPrompt } from "./prompts/weekly-coach.prompt";

/** The weekly coach note on Groq (the coach's model). Returns the JSON unvalidated. */
export class GroqWeeklyCoach implements WeeklyCoachWriter {
  constructor(
    private readonly client: GroqClient,
    private readonly opts: { model: string; timeoutMs?: number },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  write(
    input: { week: string; facts: readonly GroundFact[]; smallWeek: boolean },
    opts: { locale: ReadLocale; problems?: readonly string[] },
  ): Promise<Result<unknown, PeriodReaderError>> {
    const { system, user } = weeklyCoachPrompt(input, opts);
    return this.client.chatJson(
      z.unknown(),
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        model: this.opts.model,
        reasoningEffort: "medium",
        // A little warmer than the read: it's a note, not a list.
        temperature: 0.4,
        maxTokens: 2500,
        timeoutMs: this.opts.timeoutMs ?? 25_000,
        retries: 0,
      },
    );
  }
}
