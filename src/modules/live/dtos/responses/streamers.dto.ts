import type { Platform } from "../../domain/platform";
import type { ChannelHit, FollowedChannel, StreamerFollow } from "../../domain/streams";
import type { LiveStream, StreamGameHint } from "../../domain/watch";

export interface StreamerFollowDto {
  platform: Platform;
  channelId: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

/** Never exposes the owner's user id. */
export function toStreamerFollowDto(f: StreamerFollow): StreamerFollowDto {
  return {
    platform: f.platform,
    channelId: f.channelId,
    login: f.login,
    displayName: f.displayName,
    avatarUrl: f.avatarUrl,
    createdAt: f.createdAt.toISOString(),
  };
}

export interface ChannelSearchDto {
  channels: ChannelHit[];
}

/** What the watch hub on /live shows (public data from the streaming sites). */
export interface WatchHubData {
  /** Live Dota 2 streams from every site, most watched first; null when none answered. */
  streams: LiveStream[] | null;
  /** `platform:channel` → the live game its title seems to be about (a guess from the title). */
  hints: Record<string, StreamGameHint>;
}

/** The signed-in user's followed channels, live first. */
export interface FollowingView {
  channels: FollowedChannel[];
  limit: number;
}
