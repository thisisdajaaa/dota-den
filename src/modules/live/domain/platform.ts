/**
 * Streaming sites (pure): which ones there are, how their channel names look, and where their
 * players, chats and channels live. Twitch and Kick are both wired up (each when configured).
 */

export const PLATFORMS = ["twitch", "kick"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_NAMES: Record<Platform, string> = { twitch: "Twitch", kick: "Kick" };

export const isPlatform = (v: unknown): v is Platform =>
  typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);

/**
 * A channel name on its site: a Twitch login (letters, digits, underscores; some old ones are
 * shorter than today's 4) or a Kick slug (which may also use hyphens).
 */
export const CHANNEL_NAME: Record<Platform, RegExp> = {
  twitch: /^[A-Za-z0-9_]{1,25}$/,
  kick: /^[A-Za-z0-9_-]{1,25}$/,
};
/** Any site's channel name (for schemas that check the platform separately). */
export const ANY_CHANNEL_NAME = /^[A-Za-z0-9_-]{1,25}$/;
/** Channel (user) ids are decimal numbers on both sites. */
export const CHANNEL_ID = /^\d{1,20}$/;

/** The channel name in lower case, or null when it can't be one on that site. */
export function parseChannelName(platform: Platform, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return CHANNEL_NAME[platform].test(v) ? v.toLowerCase() : null;
}

/** Identifies a channel across sites: "twitch:gorgc". */
export const channelKey = (platform: Platform, channel: string) =>
  `${platform}:${channel.toLowerCase()}`;

export interface WatchTarget {
  platform: Platform;
  channel: string;
}

/**
 * The `?watch=` value of /live: a bare name is a Twitch channel (`?watch=gorgc`), other sites
 * are prefixed (`?watch=kick:some-slug`). Null when it isn't valid.
 */
export function parseWatchParam(value: string | null | undefined): WatchTarget | null {
  if (!value) return null;
  const at = value.indexOf(":");
  const platform = at === -1 ? "twitch" : value.slice(0, at);
  if (!isPlatform(platform)) return null;
  const channel = parseChannelName(platform, at === -1 ? value : value.slice(at + 1));
  return channel ? { platform, channel } : null;
}

export const watchParam = (t: WatchTarget) =>
  t.platform === "twitch" ? t.channel.toLowerCase() : channelKey(t.platform, t.channel);

const enc = encodeURIComponent;

/** The channel's page on its site. */
export function channelUrl(platform: Platform, channel: string): string {
  return platform === "kick"
    ? `https://kick.com/${enc(channel)}`
    : `https://www.twitch.tv/${enc(channel)}`;
}

/**
 * The embeddable player and chat. Twitch only plays inside pages it's told about, so its
 * embeds name this page's host (`parent=`). Kick has no chat embed: chat is null.
 */
export function embedUrls(
  platform: Platform,
  channel: string,
  host: string,
): { player: string; chat: string | null } {
  if (platform === "kick") return { player: `https://player.kick.com/${enc(channel)}`, chat: null };
  return {
    player: `https://player.twitch.tv/?channel=${enc(channel)}&parent=${enc(host)}&autoplay=true`,
    chat: `https://www.twitch.tv/embed/${enc(channel)}/chat?parent=${enc(host)}&darkpopout`,
  };
}

/** Image hosts each site serves avatars and previews from. */
const IMAGE_HOSTS = ["jtvnw.net", "kick.com"];

/** Only https images from the sites' own CDNs: anything else is dropped. */
export function platformImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      IMAGE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
      ? url
      : null;
  } catch {
    return null;
  }
}
