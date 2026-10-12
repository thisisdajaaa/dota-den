/** The Account page's Discord section. Never carries the webhook token. */
export interface DiscordStatusDto {
  /** A webhook is saved (it may be off, or gone). */
  connected: boolean;
  /** Matches are being posted. */
  enabled: boolean;
  /** Discord said the webhook was deleted: posting stopped until a new one is saved. */
  gone: boolean;
  /** The webhook's name in Discord. */
  name: string | null;
  /** Host and id with the token hidden, e.g. `discord.com/api/webhooks/123…/••••••••`. */
  maskedUrl: string | null;
  /** ISO time of the last post, or null. */
  lastPostedAt: string | null;
}

/** What one feed run (all players, from the daily cron) did. */
export interface DiscordRunDto {
  feeds: number;
  posted: number;
  failed: number;
  /** Discord asked us to slow down for every webhook (a global rate limit). */
  rateLimited: boolean;
  stoppedEarly: boolean;
}

/** What posting one player's new matches did. */
export interface FeedPostResultDto {
  posted: number;
  outcome:
    "posted" | "nothing_new" | "off" | "gone" | "rate_limited" | "rate_limited_global" | "failed";
}
