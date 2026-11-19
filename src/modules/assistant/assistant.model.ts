import type { AskSource } from "./domain/ask-sources";

/**
 * `assistant_chats`: one document per conversation (`_id` a UUID; a legacy chat used the user
 * id), owned by `userId`, removed by TTL.
 */
export const ASK_CHATS_COLLECTION = "assistant_chats";
/** `assistant_usage`: one document per user and Manila day (`_id` = `${userId}:${day}`). */
export const ASK_USAGE_COLLECTION = "assistant_usage";

export interface AskChatDoc {
  _id: string;
  schemaVersion: 1;
  userId: string;
  /** Missing on legacy chats (the first question is used). */
  title?: string;
  messages: Array<{
    role: "user" | "assistant";
    text: string;
    sources?: AskSource[];
    fallback?: boolean;
    at: Date;
  }>;
  updatedAt: Date;
  expiresAt: Date;
}

export interface AskUsageDoc {
  _id: string;
  schemaVersion: 1;
  userId: string;
  day: string;
  count: number;
  expiresAt: Date;
}
