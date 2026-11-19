import type { AskSource } from "./ask-sources";

/**
 * Ask Den's short memory (pure): the last few turns of a player's chat, kept so a follow-up
 * ("and on Lion?") makes sense. Only the words are kept, never tool results.
 */

/** Turns (a question and its answer) kept per player. */
export const ASK_MAX_TURNS = 10;
/** A chat is forgotten this long after its last message. */
export const ASK_CHAT_TTL_MS = 3 * 86_400_000;

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
  return out;
}
