import type { AskConversationSummary, AskMessage } from "../../domain/ask-chat";
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

export interface AskConversationDto {
  id: string;
  /** null when unchanged (an answer added to a conversation the list already has). */
  title: string | null;
  updatedAt: string;
}

export interface AskConversationListItemDto {
  id: string;
  title: string;
  updatedAt: string;
  messages: number;
}

export interface AskStateDto {
  enabled: boolean;
  quota: AskQuota;
  /** Questions a day with Plus (for the upsell). */
  plusLimit: number;
  /** The player's conversations, newest first. */
  conversations: AskConversationListItemDto[];
  /** The open conversation; null for a new chat. */
  conversationId: string | null;
  messages: AskMessageDto[];
}

export interface AskAnswerDto {
  /** Where the turn was saved; null when it couldn't be saved. */
  conversation: AskConversationDto | null;
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

export function toConversationDto(c: AskConversationSummary): AskConversationListItemDto {
  return {
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages,
  };
}
