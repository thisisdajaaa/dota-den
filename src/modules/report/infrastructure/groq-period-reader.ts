import { z } from "zod";
import type { GroqClient } from "@/common/llm/groq-client";
import type { GroundFact } from "@/common/utils/grounding";
import type { Result } from "@/common/result";
import type { PeriodReader, PeriodReaderError } from "../report.ports";
import type { ReadLocale } from "../domain/period-read";
import { periodReadPrompt } from "./prompts/period-read.prompt";

/** The battle report's AI read on Groq. Returns the model's JSON unvalidated (the service checks it). */
export class GroqPeriodReader implements PeriodReader {
  constructor(
    private readonly client: GroqClient,
    private readonly opts: { model: string; timeoutMs?: number },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  write(
    input: { from: string; to: string; facts: readonly GroundFact[] },
    opts: { locale: ReadLocale; problems?: readonly string[] },
  ): Promise<Result<unknown, PeriodReaderError>> {
    const { system, user } = periodReadPrompt(input, opts);
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
        retries: 0,
      },
    );
  }
}
