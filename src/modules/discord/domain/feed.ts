/** What the Discord feed posts, and the limits that keep it from flooding a channel. */

/** Discord allows at most 10 embeds in one message. */
export const EMBEDS_PER_MESSAGE = 10;
/** At most this many matches per player per run; the rest go out on the next run. */
export const MAX_MATCHES_PER_RUN = 10;
/** A match that started longer ago than this isn't news any more: it's never posted. */
export const MAX_MATCH_AGE_MS = 3 * 24 * 3_600_000;

/** Embed colours: green for a win, red for a loss, gold for the test post. */
export const WIN_COLOR = 0x3fb950;
export const LOSS_COLOR = 0xe5534b;
export const TEST_COLOR = 0xd4a64a;

/** One imported match, as the feed needs it. Nothing here is guessed. */
export interface FeedMatch {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  result: "win" | "loss";
  kills: number;
  deaths: number;
  assists: number;
  ranked: boolean;
  /** "unknown" when Dota didn't record the party size: never shown as solo. */
  queueClass: "solo" | "party" | "unknown";
  partySize: number | null;
  /** The game mode's name ("All Pick", "Turbo"), or null when Dota didn't say. */
  mode: string | null;
}

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color: number;
  author?: { name: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

/** The JSON body of a webhook post. Mentions are always off. */
export interface DiscordMessage {
  username: string;
  embeds: DiscordEmbed[];
  allowed_mentions: { parse: [] };
}

export function discordMessage(embeds: DiscordEmbed[]): DiscordMessage {
  return { username: "Dota Den", embeds, allowed_mentions: { parse: [] } };
}

/**
 * The oldest start time a match may have to be posted: after the feed was turned on (never
 * history from before), and recent enough to still be news.
 */
export function feedWindowStart(since: Date, now: Date): Date {
  return new Date(Math.max(since.getTime(), now.getTime() - MAX_MATCH_AGE_MS));
}

/** "34:05", or "1:02:09" for long games. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
