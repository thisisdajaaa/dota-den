import type { GroqClient, ToolChatMessage, ToolDefinition } from "@/common/llm/groq-client";
import type { AskModel } from "../assistant.ports";

/** Ask Den's model on Groq (OpenAI-style tool calling). */
export class GroqAskModel implements AskModel {
  constructor(
    private readonly client: GroqClient,
    private readonly opts: { model: string; timeoutMs?: number },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  next(
    messages: ToolChatMessage[],
    opts: { tools: readonly ToolDefinition[]; toolChoice: "auto" | "none" },
  ) {
    return this.client.chatWithTools(messages, {
      model: this.opts.model,
      tools: opts.tools,
      toolChoice: opts.toolChoice,
      reasoningEffort: "low",
      temperature: 0.3,
      maxTokens: 2_000,
      timeoutMs: this.opts.timeoutMs ?? 20_000,
      // One quick transport retry: the player is waiting, and each try costs budget anyway.
      retries: 1,
    });
  }
}
