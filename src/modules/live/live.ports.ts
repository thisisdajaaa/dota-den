import { type LiveGame } from "./domain/live-game";
import type { Platform } from "./domain/platform";
import type { ChannelHit, StreamChannel, StreamerFollow } from "./domain/streams";
import { type LiveStream } from "./domain/watch";

/** Where live games come from. Null means the feed is unavailable right now. */
export interface LiveSource {
  games(): Promise<LiveGame[] | null>;
  leagueName(leagueId: number): Promise<string | null>;
}

/** Looking up one channel: found, known not to exist, or the site couldn't be asked. */
export type ChannelLookup =
  { status: "found"; channel: StreamChannel } | { status: "not_found" } | { status: "unavailable" };

/**
 * One streaming site (Twitch, Kick, …). The services merge every configured directory's
 * results. Methods return null when the site is unavailable right now.
 */
export interface StreamDirectory {
  readonly platform: Platform;
  /** Live Dota 2 streams on this site. */
  liveDotaStreams(): Promise<LiveStream[] | null>;
  /** Channels whose names match `query`, best first; `liveOnly` keeps live ones. */
  searchChannels(query: string, liveOnly: boolean): Promise<ChannelHit[] | null>;
  /** The live streams among these channels (logins or slugs, any game), keyed in lower case. */
  liveByChannels(channels: readonly string[]): Promise<Map<string, LiveStream> | null>;
  channelById(id: string): Promise<ChannelLookup>;
}

export interface StreamerFollowsPort {
  /** Idempotent: `false` when the follow already existed (its names are refreshed). */
  add(follow: StreamerFollow): Promise<boolean>;
  /** Scoped by owner; `false` when there was nothing to remove. */
  remove(userId: string, platform: Platform, channelId: string): Promise<boolean>;
  /** One user's follows, most recently added first. */
  list(userId: string): Promise<StreamerFollow[]>;
  count(userId: string): Promise<number>;
  find(userId: string, platform: Platform, channelId: string): Promise<StreamerFollow | null>;
}
