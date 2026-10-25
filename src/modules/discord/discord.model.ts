export const DISCORD_COLLECTIONS = {
  webhooks: "discord_webhooks",
  log: "discord_post_log",
  links: "discord_links",
} as const;

/**
 * A Dota Den account linked to a Discord account (OAuth2 `identify`). `guilds` are the servers
 * where the player used the bot: the server leaderboard counts only them (no member lists are
 * read from Discord).
 */
export interface DiscordLinkDocument {
  /** The Discord user id. */
  _id: string;
  userId: string;
  accountId32: number;
  username: string;
  globalName: string | null;
  avatar: string | null;
  guilds: string[];
  linkedAt: Date;
  updatedAt: Date;
}

/**
 * A player's Discord feed: one webhook per player. `token` is a secret (anyone with it can
 * post to the channel): it is never sent to the browser or included in the data export.
 */
export interface DiscordWebhookDocument {
  /** The user id. */
  _id: string;
  accountId32: number;
  /** `https://discord.com` (whichever Discord host the URL used). */
  origin: string;
  webhookId: string;
  token: string;
  /** The webhook's name in Discord, from Discord when it was checked. */
  name: string | null;
  channelId: string | null;
  /** The player wants their matches posted. */
  enabled: boolean;
  /** Discord said the webhook was deleted (404/401): posting stopped until a new one is set. */
  gone: boolean;
  /** Only matches that started after this are posted (set when the feed is turned on). */
  since: Date;
  lastPostedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One match claimed for posting, so it is never posted twice. */
export interface DiscordPostLogDocument {
  /** `${userId}:${matchId}` */
  _id: string;
  userId: string;
  matchId: string;
  startedAt: Date;
  claimedAt: Date;
  /** Null while the post is in flight. */
  sentAt: Date | null;
}

export const discordPostId = (userId: string, matchId: string) => `${userId}:${matchId}`;
