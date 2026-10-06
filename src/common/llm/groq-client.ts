import { z, type ZodType } from "zod";
import { err, ok, type Result } from "@/common/result";

/**
 * One client for every LLM call (Groq's OpenAI-compatible chat API). Features keep their
 * prompts as pure functions next to their adapter and call `chat` / `chatJson` here, so
 * timeouts, retries and response checks are written once.
 */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export type ChatContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** For reasoning models (e.g. gpt-oss). */
  reasoningEffort?: "low" | "medium" | "high";
  /** Ask for a JSON object reply (`response_format: json_object`). */
  json?: boolean;
  timeoutMs?: number;
  /** Extra attempts after a 429, a 5xx or a network error. Default 1. */
  retries?: number;
}

export type ChatError =
  { type: "unavailable"; cause: string } | { type: "invalid_response"; cause: string };

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class GroqClient {
  constructor(
    private readonly opts: {
      apiKey: string;
      fetch?: FetchLike;
      url?: string;
      /** Wait before a retry (ms); tests pass 0. */
      retryDelayMs?: number;
    },
  ) {}

  /** The model's reply text (null when it sent none). */
  async chat(
    messages: ChatMessage[],
    opts: ChatOptions,
  ): Promise<Result<string | null, ChatError>> {
    const body = JSON.stringify({
      model: opts.model,
      messages,
      ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
      ...(opts.maxTokens === undefined ? {} : { max_completion_tokens: opts.maxTokens }),
      ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    });
    const attempts = 1 + (opts.retries ?? 1);
    let last: ChatError = { type: "unavailable", cause: "no attempt" };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) await sleep(this.opts.retryDelayMs ?? 500 * (attempt - 1));
      let res: Response;
      try {
        res = await (this.opts.fetch ?? fetch)(this.opts.url ?? GROQ_CHAT_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.opts.apiKey}`,
            "content-type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        });
      } catch (e) {
        last = { type: "unavailable", cause: e instanceof Error ? e.name : "network" };
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        last = { type: "unavailable", cause: `status ${res.status}` };
        continue;
      }
      if (!res.ok) return err({ type: "unavailable", cause: `status ${res.status}` });
      const parsed = CompletionSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return err({ type: "invalid_response", cause: "completion shape" });
      return ok(parsed.data.choices[0].message.content);
    }
    return err(last);
  }

  /** The reply parsed as JSON and checked against `schema`. */
  async chatJson<T>(
    schema: ZodType<T>,
    messages: ChatMessage[],
    opts: ChatOptions,
  ): Promise<Result<T, ChatError>> {
    const reply = await this.chat(messages, { ...opts, json: opts.json ?? true });
    if (!reply.ok) return reply;
    let json: unknown;
    try {
      json = JSON.parse(reply.value ?? "");
    } catch {
      return err({ type: "invalid_response", cause: "not json" });
    }
    const parsed = schema.safeParse(json);
    return parsed.success
      ? ok(parsed.data)
      : err({ type: "invalid_response", cause: "answer shape" });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
