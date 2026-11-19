import type {
  ChatError,
  ToolChatMessage,
  ToolDefinition,
  ToolTurn,
} from "@/common/llm/groq-client";
import type { DataOwner } from "@/common/privacy/user-data";
import type { Result } from "@/common/result";
import type { AskConversationSummary, AskMessage } from "./domain/ask-chat";
import type { ToolResult } from "./domain/ask-results";
import type { AskToolArgs } from "./schemas/ask-tools.schema";

/** The signed-in player. Every tool is scoped to this, set by the server, never by the model. */
export interface AskOwner {
  userId: string;
  accountId32: number;
}

/** A tool-calling chat model (Groq). */
export interface AskModel {
  readonly model: string;
  next(
    messages: ToolChatMessage[],
    opts: { tools: readonly ToolDefinition[]; toolChoice: "auto" | "none" },
  ): Promise<Result<ToolTurn, ChatError>>;
}

/**
 * The data behind Ask Den's tools: thin adapters over other features' services. Read-only;
 * personal data is always the owner's own, public aggregates need no owner.
 */
export interface AskDataPort {
  recentGames(owner: AskOwner, args: AskToolArgs<"my_recent_games">): Promise<ToolResult>;
  heroStats(owner: AskOwner, args: AskToolArgs<"my_hero_stats">): Promise<ToolResult>;
  matchSummary(owner: AskOwner, args: AskToolArgs<"match_summary">): Promise<ToolResult>;
  sessions(owner: AskOwner): Promise<ToolResult>;
  mmr(owner: AskOwner): Promise<ToolResult>;
  heroGuide(args: AskToolArgs<"hero_guide">): Promise<ToolResult>;
  wardSpots(args: AskToolArgs<"ward_spots">): Promise<ToolResult>;
  heroCounters(owner: AskOwner, args: AskToolArgs<"hero_counters">): Promise<ToolResult>;
  metaHeroes(owner: AskOwner, args: AskToolArgs<"meta_heroes">): Promise<ToolResult>;
  patchNotes(args: AskToolArgs<"patch_notes">): Promise<ToolResult>;
}

/** Each player's conversations (kept for a while after their last message). */
export interface AskChatsPort {
  /** Newest first, at most `limit`. */
  list(userId: string, limit: number): Promise<AskConversationSummary[]>;
  /** The conversation's messages, or null when it isn't this user's (or doesn't exist). */
  get(userId: string, id: string): Promise<AskMessage[] | null>;
  /** Starts a conversation and forgets the user's oldest past `maxConversations`; its id. */
  create(
    userId: string,
    messages: readonly AskMessage[],
    opts: { title: string; now: Date; expiresAt: Date; maxConversations: number },
  ): Promise<string>;
  /** Appends, keeping the newest `keep` messages; false when it isn't this user's. */
  append(
    userId: string,
    id: string,
    messages: readonly AskMessage[],
    opts: { keep: number; now: Date; expiresAt: Date },
  ): Promise<boolean>;
  /** Forgets one conversation; false when it isn't this user's. */
  remove(userId: string, id: string): Promise<boolean>;
  /** Forgets all of them. */
  clear(userId: string): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** Questions asked per player and Manila day. */
export interface AskUsagePort {
  used(userId: string, day: string): Promise<number>;
  /** Takes one question if fewer than `limit` were taken that day (atomic); false when not. */
  reserve(userId: string, day: string, limit: number, expiresAt: Date): Promise<boolean>;
  /** Gives a question back (the answer failed). */
  release(userId: string, day: string): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}
