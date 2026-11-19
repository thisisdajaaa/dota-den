import type { AskMessage } from "../../domain/ask-chat";
import type { AskQuota } from "../../domain/ask-quota";
import type { AskSource } from "../../domain/ask-sources";
import type { AskToolName } from "../../schemas/ask-tools.schema";

export interface AskMessageDto {
  role: "user" | "assistant";
  text: string;
  sources: AskSource[];
  fallback: boolean;
  at: string;
}

export interface AskStateDto {
  enabled: boolean;
  quota: AskQuota;
  /** Questions a day with Plus (for the upsell). */
  plusLimit: number;
  messages: AskMessageDto[];
}

export interface AskAnswerDto {
  /** The player's question and the answer, as stored. */
  question: AskMessageDto;
  answer: AskMessageDto;
  quota: AskQuota;
}

/** One line of the streamed reply (NDJSON). */
export type AskEventDto =
  | { type: "status"; tool: AskToolName }
  | { type: "answer"; data: AskAnswerDto }
  | { type: "error"; reason: string; message: string };

export function toMessageDto(m: AskMessage): AskMessageDto {
  return {
    role: m.role,
    text: m.text,
    sources: m.sources ?? [],
    fallback: m.fallback ?? false,
    at: m.at.toISOString(),
  };
}
