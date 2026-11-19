import type { AskSource } from "./ask-sources";

/**
 * Ask Den's conversations (pure). A player keeps several chats and can go back to any of
 * them; the model sees the newest turns of the one being continued, so a follow-up ("and on
 * Lion?") makes sense. Only the words are kept, never tool results.
 */

/** Turns (a question and its answer) the model sees from the conversation. */
export const ASK_MAX_TURNS = 10;
/** Messages kept per conversation (older ones drop off). */
export const ASK_KEEP_MESSAGES = 60;
/** Conversations kept per player: starting one more forgets the oldest. */
export const ASK_MAX_CONVERSATIONS = 30;
/** A conversation is forgotten this long after its last message. */
export const ASK_CHAT_TTL_MS = 30 * 86_400_000;
/** Longest conversation title (made from its first question). */
export const ASK_TITLE_CHARS = 60;

/** Conversation ids are ours (UUIDs); a legacy chat used the user id (24 hex). */
export const CONVERSATION_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/;

/** A conversation in the list: no messages. */
export interface AskConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
  messages: number;
}

/** A conversation's title: its first question on one line, cut at a word. */
export function conversationTitle(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  if (line.length <= ASK_TITLE_CHARS) return line;
  const head = line.slice(0, ASK_TITLE_CHARS);
  const space = head.lastIndexOf(" ");
  return `${(space > ASK_TITLE_CHARS / 2 ? head.slice(0, space) : head).trim()}…`;
}

export interface AskMessage {
  role: "user" | "assistant";
  text: string;
  /** Answers only: where the data came from. */
  sources?: AskSource[];
  /** Answers only: no checked answer could be written (the UI shows a fixed message). */
  fallback?: boolean;
  at: Date;
}

/**
 * The history the model sees: checked answers and the questions they answer. A question whose
 * answer was a fallback is left out with it (there's nothing useful to follow up on).
 */
export function modelHistory(messages: readonly AskMessage[]): AskMessage[] {
  const out: AskMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const next = messages[i + 1];
    if (m.role === "user") {
      if (next?.role === "assistant" && !next.fallback) {
        out.push(m, next);
        i++;
      }
    }
  }
  return out.slice(-ASK_MAX_TURNS * 2);
}
