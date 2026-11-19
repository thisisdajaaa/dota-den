import { z, type ZodType } from "zod";
import { err, ok, type Result } from "@/common/result";

/**
 * One client for every LLM call (Groq's OpenAI-compatible chat API). Features keep their
 * prompts as pure functions next to their adapter and call `chat` / `chatJson` here, so
 * timeouts, retries and response checks are written once.
 */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** The chat completions URL under a base (GROQ_BASE_URL, for tests), else Groq's own. */
export function groqChatUrl(base?: string): string {
  return base ? `${base.replace(/\/$/, "")}/openai/v1/chat/completions` : GROQ_CHAT_URL;
}

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

/** A function the model may call (OpenAI-style tool calling). `parameters` is a JSON schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** One function call the model asked for; `arguments` is the model's JSON text, unchecked. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Messages of a tool-calling conversation: the plain ones, plus calls and their results. */
export type ToolChatMessage =
  | ChatMessage
  | { role: "assistant"; content: string | null; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolTurn {
  /** The model's text (null when it only called tools). */
  content: string | null;
  /** Calls to run before asking again; empty when the model answered. */
  toolCalls: ToolCall[];
}

export type ChatError =
  { type: "unavailable"; cause: string } | { type: "invalid_response"; cause: string };

const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

const ToolCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                function: z.object({ name: z.string(), arguments: z.string().default("{}") }),
              }),
            )
            .nullable()
            .optional(),
        }),
      }),
    )
    .min(1),
});

/** The wire shape (snake_case) of a tool-calling message. */
function toWire(m: ToolChatMessage): Record<string, unknown> {
  if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  if (m.role === "assistant" && "toolCalls" in m) {
    return {
      role: "assistant",
      content: m.content,
      ...(m.toolCalls.length
        ? {
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.arguments },
            })),
          }
        : {}),
    };
  }
  return { role: m.role, content: m.content };
}

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
    const res = await this.post({ messages }, opts);
    if (!res.ok) return res;
    const parsed = CompletionSchema.safeParse(res.value);
    if (!parsed.success) return err({ type: "invalid_response", cause: "completion shape" });
    return ok(parsed.data.choices[0].message.content);
  }

  /**
   * One step of a tool-calling conversation: the model either asks for tool calls (run them,
   * append their results and call again) or answers with text. Running tools is the caller's job.
   */
  async chatWithTools(
    messages: ToolChatMessage[],
    opts: ChatOptions & { tools: readonly ToolDefinition[]; toolChoice?: "auto" | "none" },
  ): Promise<Result<ToolTurn, ChatError>> {
    const res = await this.post(
      {
        messages: messages.map(toWire),
        tools: opts.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: opts.toolChoice ?? "auto",
      },
      { ...opts, json: false },
    );
    if (!res.ok) return res;
    const parsed = ToolCompletionSchema.safeParse(res.value);
    if (!parsed.success) return err({ type: "invalid_response", cause: "completion shape" });
    const message = parsed.data.choices[0].message;
    return ok({
      content: message.content ?? null,
      toolCalls: (message.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: c.function.arguments,
      })),
    });
  }

  /** POSTs a completion request with the shared options, timeout and retries; the raw JSON. */
  private async post(
    payload: Record<string, unknown>,
    opts: ChatOptions,
  ): Promise<Result<unknown, ChatError>> {
    const body = JSON.stringify({
      model: opts.model,
      ...payload,
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
      if (!res.ok) {
        // The provider's own reason (e.g. a blocked model or region) makes the log useful.
        const reason = await res
          .json()
          .then((b: { error?: { message?: unknown } }) =>
            typeof b?.error?.message === "string" ? b.error.message.slice(0, 160) : "",
          )
          .catch(() => "");
        const cause = reason ? `status ${res.status}: ${reason}` : `status ${res.status}`;
        // The model wrote tool arguments that don't fit the schema: a bad answer, not an outage.
        if (res.status === 400 && /tool call validation/i.test(reason))
          return err({ type: "invalid_response", cause });
        return err({ type: "unavailable", cause });
      }
      return ok(await res.json().catch(() => null));
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
