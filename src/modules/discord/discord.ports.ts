import type { DataOwner } from "@/common/privacy/user-data";
import type { BotGame, BotLocale } from "./domain/bot";
import type { BotHero } from "./domain/hero-match";
import type { GuildSettings, NudgeSetting } from "./domain/server";
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

/** Who a Discord sign-in says the player is. */
export interface DiscordIdentity {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/** A Dota Den account linked to a Discord account. */
export interface DiscordLink {
  discordId: string;
  userId: string;
  accountId32: number;
  username: string;
  globalName: string | null;
  avatar: string | null;
  /** Servers where the player used the bot. */
  guilds: string[];
  /** Servers where they turned the Monday recap on. */
  recapGuilds: string[];
  nudges: NudgeSetting | null;
  linkedAt: Date;
}

export interface DiscordLinksPort {
  forUser(userId: string): Promise<DiscordLink | null>;
  forDiscord(discordId: string): Promise<DiscordLink | null>;
  inGuild(guildId: string, limit: number): Promise<DiscordLink[]>;
  link(
    input: Omit<DiscordLink, "guilds" | "linkedAt" | "recapGuilds" | "nudges">,
    now: Date,
  ): Promise<void>;
  rememberGuild(discordId: string, guildId: string): Promise<void>;
  /** Members who turned the recap on in this server. */
  recapMembers(guildId: string, limit: number): Promise<DiscordLink[]>;
  setRecap(discordId: string, guildId: string, on: boolean): Promise<void>;
  setNudges(userId: string, nudges: NudgeSetting | null): Promise<boolean>;
  /** Dota Den users who want nudges on Discord. */
  nudgeUserIds(): Promise<string[]>;
  unlink(userId: string): Promise<boolean>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** A server's settings as stored (`/den setup`). */
export interface StoredGuild extends GuildSettings {
  language: BotLocale | null;
  userId: string;
  setupByDiscordId: string;
  lastRecapWeek: string | null;
}

export interface DiscordGuildsPort {
  get(guildId: string): Promise<StoredGuild | null>;
  save(guild: Omit<StoredGuild, "lastRecapWeek">, now: Date): Promise<void>;
  /** Servers with the recap on and a channel. */
  withRecap(): Promise<StoredGuild[]>;
  markRecapped(guildId: string, week: string, now: Date): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface BotLogPort {
  /** Claims a post; false when it was already claimed (posted, or being posted). */
  claim(
    id: string,
    who: { userId: string | null; guildId: string | null },
    now: Date,
  ): Promise<boolean>;
  release(id: string): Promise<void>;
  markSent(id: string, now: Date): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** A message the bot sends (Discord's message object, the parts we use). */
export interface BotMessage {
  content?: string;
  embeds?: Record<string, unknown>[];
  flags?: number;
  allowed_mentions: { parse: string[] };
}

export type BotPostOutcome =
  | { kind: "ok" }
  /** The channel or user is gone, or the bot may not post there (403/404). */
  | { kind: "forbidden"; status: number }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "failed"; status?: number };

/** Discord's API as the bot uses it. */
export interface DiscordApiPort {
  /** Replaces a deferred "thinking…" answer (interaction webhook; no bot token needed). */
  editOriginal(appId: string, token: string, message: BotMessage): Promise<BotPostOutcome>;
  /** Posts to a channel as the bot (needs the bot token). */
  postToChannel(channelId: string, message: BotMessage): Promise<BotPostOutcome>;
  /** Sends a direct message as the bot (needs the bot token). */
  directMessage(discordId: string, message: BotMessage): Promise<BotPostOutcome>;
  /** Whether the bot token is set (channel posts and DMs). */
  readonly canPost: boolean;
}

/** A coach review's fact, as the bot shows it (from our stored fact sheet). */
export interface BotCoachFact {
  base: string;
  subject: string | null;
  value: number | string;
  unit: string;
}

export type BotCoachResult =
  | {
      kind: "review";
      matchId: string;
      heroId: number;
      cached: boolean;
      points: {
        kind: "strength" | "improve";
        title: string;
        detail: string;
        facts: BotCoachFact[];
      }[];
    }
  | { kind: "no_match" }
  | { kind: "unparsed"; matchId: string }
  | { kind: "quota" }
  | { kind: "resting" }
  | { kind: "off" }
  | { kind: "failed" };

export type BotAskResult =
  | { kind: "answer"; text: string; remaining: number; limit: number }
  | { kind: "quota"; resetsAt: string }
  | { kind: "fallback" }
  | { kind: "resting" }
  | { kind: "off" }
  | { kind: "failed" };

export interface BotPickSuggestion {
  heroId: number;
  you: { games: number; wins: number };
  counters: { heroId: number; points: number; games: number }[];
  allies: { heroId: number; points: number; games: number }[];
}

export type BotPickResult =
  | {
      kind: "ok";
      suggestions: BotPickSuggestion[];
      poolSize: number;
      highRank: boolean;
    }
  | { kind: "failed" };

export interface BotUser {
  id: string;
  accountId32: number;
}

/** What the bot asks other features for (closures over their services). */
export interface BotFeatures {
  games(accountId32: number): Promise<BotGame[]>;
  heroes(): Promise<BotHero[]>;
  userLanguage(userId: string): Promise<string | null>;
  setLanguage(userId: string, locale: BotLocale): Promise<void>;
  isPlus(userId: string): Promise<boolean>;
  /** The coach review of a match (the latest one when null); stored reviews are reused. */
  coach(user: BotUser, matchId: string | null, locale: BotLocale): Promise<BotCoachResult>;
  /** One Ask Den question, from the same daily allowance as the site. */
  ask(user: BotUser, question: string, locale: BotLocale): Promise<BotAskResult>;
  pick(
    user: BotUser,
    req: { enemies: number[]; allies: number[]; position: 1 | 2 | 3 | 4 | 5 | null },
  ): Promise<BotPickResult>;
}
