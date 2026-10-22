import type { StreamerFollow } from "./domain/streams";

export const LIVE_SCHEMA_VERSION = 1;
export const LIVE_COLLECTIONS = {
  streamerFollows: "streamer_follows",
} as const;

/** A followed channel on a streaming site. Unique by (userId, platform, channelId). */
export interface StreamerFollowDoc extends StreamerFollow {
  schemaVersion: number;
  /** When the login or display name was last refreshed (on a repeat follow). */
  updatedAt: Date;
}
