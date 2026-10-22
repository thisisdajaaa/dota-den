/**
 * The watch hub's stream lists (pure): sorting, language filters, channels, and the followed
 * channels row. Streams from every site are mixed in one list.
 */
import { channelKey, platformImage, type Platform } from "./platform";
import type { LiveStream } from "./watch";

/** A channel (user) on a streaming site, as search and lookups report it. */
export interface StreamChannel {
  platform: Platform;
  /** The site's user id: stable when the channel renames. */
  id: string;
  /** Twitch login or Kick slug: what embeds and links use. */
  login: string;
  displayName: string;
  avatarUrl: string | null;
}

/** A channel search result: live or not, with what it's streaming when live. */
export interface ChannelHit extends StreamChannel {
  live: boolean;
  title: string;
  gameName: string | null;
  language: string | null;
}

/** A stream preview at a given size, from a `{width}x{height}` template (Twitch's form). */
export function thumbnail(
  template: string | null | undefined,
  width: number,
  height: number,
): string | null {
  const url = platformImage(template);
  return url ? url.replace("{width}", String(width)).replace("{height}", String(height)) : null;
}

/** Most watched first; ties by site and channel, so the order is stable between refreshes. */
export function byViewers<T extends Pick<LiveStream, "viewers" | "channel" | "platform">>(
  streams: readonly T[],
): T[] {
  return [...streams].sort(
    (a, b) =>
      b.viewers - a.viewers ||
      a.platform.localeCompare(b.platform) ||
      a.channel.localeCompare(b.channel),
  );
}

/** One list from every site's streams, most watched first. */
export function mergeStreams(lists: readonly (readonly LiveStream[] | null)[]): LiveStream[] {
  const seen = new Map<string, LiveStream>();
  for (const list of lists)
    for (const s of list ?? []) seen.set(channelKey(s.platform, s.channel), s);
  return byViewers([...seen.values()]);
}

export interface LanguageOption {
  code: string;
  streams: number;
}

/** The languages streams are in, most streams first (then by code). */
export function languageOptions(
  streams: readonly Pick<LiveStream, "language">[],
): LanguageOption[] {
  const counts = new Map<string, number>();
  for (const s of streams) {
    const code = s.language.toLowerCase() || "other";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts]
    .map(([code, n]) => ({ code, streams: n }))
    .sort((a, b) => b.streams - a.streams || a.code.localeCompare(b.code));
}

/** Streams in one language; every stream when `language` is null. */
export function inLanguage<T extends Pick<LiveStream, "language">>(
  streams: readonly T[],
  language: string | null,
): T[] {
  if (!language) return [...streams];
  return streams.filter((s) => (s.language.toLowerCase() || "other") === language);
}

/** A channel the signed-in user follows. Unique per user by (platform, channelId). */
export interface StreamerFollow {
  userId: string;
  platform: Platform;
  /** The site's user id: stable when the channel renames. */
  channelId: string;
  /** Login or slug when followed (used for the embed and the live lookup). */
  login: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
}

/** One Helix request covers 100 logins, so the row costs one call per site. */
export const MAX_STREAMER_FOLLOWS = 100;

/** Whether a followed channel is live; `unknown` when its site couldn't be asked. */
export type ChannelStatus = "live" | "offline" | "unknown";

export interface FollowedChannel {
  platform: Platform;
  channelId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  status: ChannelStatus;
  /** The live stream, when `status` is live. */
  stream: LiveStream | null;
}

/**
 * The "Following" row: live channels first (most watched first), then the rest by name.
 * `live` maps each site to its live streams (keyed by lower-case channel name); a site that
 * couldn't be asked is missing or null, and its channels are then `unknown`, never offline.
 */
export function followingRow(
  follows: readonly Omit<StreamerFollow, "userId">[],
  live: Partial<Record<Platform, ReadonlyMap<string, LiveStream> | null>>,
): FollowedChannel[] {
  const rows = follows.map((f): FollowedChannel => {
    const site = live[f.platform] ?? null;
    const stream = site?.get(f.login.toLowerCase()) ?? null;
    return {
      platform: f.platform,
      channelId: f.channelId,
      login: f.login,
      displayName: stream?.displayName ?? f.displayName,
      avatarUrl: f.avatarUrl ?? stream?.avatarUrl ?? null,
      status: site === null ? "unknown" : stream ? "live" : "offline",
      stream,
    };
  });
  return sortFollowing(rows);
}

/** Live first (most watched first), then by name. */
export function sortFollowing(rows: readonly FollowedChannel[]): FollowedChannel[] {
  return [...rows].sort((a, b) => {
    if (a.stream && b.stream) return b.stream.viewers - a.stream.viewers;
    if (a.stream) return -1;
    if (b.stream) return 1;
    return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
  });
}

/** Split into batches of at most `size` (Helix takes 100 ids or logins per request). */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** "950", "12.3K", "1.2M": viewer counts at a glance. */
export function compactCount(n: number): string {
  const v = Math.max(0, Math.round(n));
  const fmt = (x: number, unit: string) => `${Number(x.toFixed(x < 10 ? 1 : 0))}${unit}`;
  if (v >= 1_000_000) return fmt(v / 1_000_000, "M");
  if (v >= 1_000) return fmt(v / 1_000, "K");
  return String(v);
}

/** What a live-game guess is called: the matchup, else the league. */
export function hintLabel(hint: {
  radiant: string | null;
  dire: string | null;
  leagueName: string | null;
}): { kind: "versus"; radiant: string; dire: string } | { kind: "league"; name: string } | null {
  if (hint.radiant && hint.dire) return { kind: "versus", radiant: hint.radiant, dire: hint.dire };
  if (hint.leagueName) return { kind: "league", name: hint.leagueName };
  return null;
}
