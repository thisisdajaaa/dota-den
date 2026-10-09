import type { DataOwner } from "@/common/privacy/user-data";
import type { WebhookTarget } from "./domain/discord-webhook";
import type { DiscordMessage, FeedMatch } from "./domain/feed";

/** A saved feed as the services see it. */
export interface StoredFeed {
  userId: string;
  accountId32: number;
  target: WebhookTarget;
  name: string | null;
  channelId: string | null;
  enabled: boolean;
  gone: boolean;
  since: Date;
  lastPostedAt: Date | null;
}

export interface WebhooksRepositoryPort {
  get(userId: string): Promise<StoredFeed | null>;
  byAccount(accountId32: number): Promise<StoredFeed | null>;
  /** Feeds that are on and still exist in Discord. */
  active(): Promise<StoredFeed[]>;
  /** Saves a newly checked webhook (replacing any earlier one), turned on from `now`. */
  save(
    feed: Omit<StoredFeed, "enabled" | "gone" | "since" | "lastPostedAt">,
    now: Date,
  ): Promise<void>;
  /** Turning on starts a new window (`since`), so games played while off are never posted. */
  setEnabled(userId: string, enabled: boolean, now: Date): Promise<boolean>;
  markGone(userId: string, now: Date): Promise<void>;
  markPosted(userId: string, now: Date): Promise<void>;
  remove(userId: string): Promise<boolean>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface PostLogPort {
  /** Claims a match for posting; false when it was already posted (or is being posted). */
  claim(userId: string, matchId: string, startedAt: Date, now: Date): Promise<boolean>;
  release(userId: string, matchIds: readonly string[]): Promise<void>;
  markSent(userId: string, matchIds: readonly string[], now: Date): Promise<void>;
  /** Matches already claimed that started at or after `from`. */
  claimedSince(userId: string, from: Date): Promise<string[]>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export type WebhookInfoOutcome =
  | { kind: "ok"; name: string | null; channelId: string | null }
  | { kind: "gone" }
  | { kind: "failed"; status?: number };

export type PostOutcome =
  | { kind: "ok" }
  | { kind: "gone" }
  | { kind: "rate_limited"; retryAfterMs: number; global: boolean }
  | { kind: "failed"; status?: number };

/** Talks to Discord's webhook API. */
export interface DiscordClient {
  info(target: WebhookTarget): Promise<WebhookInfoOutcome>;
  post(target: WebhookTarget, message: DiscordMessage): Promise<PostOutcome>;
}

/** New matches for the feed (from matches), oldest first. */
export interface FeedMatchesSource {
  startedAfter(
    accountId32: number,
    from: Date,
    opts: { excludeMatchIds: readonly string[]; limit: number },
  ): Promise<FeedMatch[]>;
}

/** A player as the feed needs them (from identity). */
export interface FeedUser {
  id: string;
  language: string | null;
  /** Their Steam name, shown on each post; null when unknown. */
  name: string | null;
}

export interface FeedUsers {
  byIds(ids: readonly string[]): Promise<FeedUser[]>;
}

export interface FeedHeroes {
  /** Hero names and portrait URLs by hero id. */
  all(): Promise<Map<number, { name: string; imageUrl: string | null }>>;
}
