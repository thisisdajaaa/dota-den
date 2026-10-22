import "server-only";
import { getRedis } from "@/common/cache/redis";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { OpenDotaLiveSource } from "./infrastructure/opendota-live-source";
import { TwitchDirectory, type SharedCache } from "./infrastructure/twitch-directory";
import { LiveController } from "./live.controller";
import type { StreamDirectory } from "./live.ports";
import { LiveService } from "./live.service";
import { StreamerFollowsRepository } from "./repositories/streamer-follows.repository";
import { StreamerFollowService } from "./streamer-follows.service";

/** Redis for the stream list and searches, or nothing when Redis isn't configured. */
function sharedCache(): SharedCache | undefined {
  const redis = getRedis();
  if (!redis) return undefined;
  return {
    get: (key) => redis.get<string>(key),
    set: async (key, value, ttlSeconds) => {
      await redis.set(key, value, { ex: Math.max(1, Math.round(ttlSeconds)) });
    },
  };
}

/** Twitch is optional: without keys the watch section falls back to search links. */
function twitchDirectory(): TwitchDirectory | null {
  const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_API_BASE_URL, TWITCH_AUTH_URL } = env();
  return TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET
    ? new TwitchDirectory({
        clientId: TWITCH_CLIENT_ID,
        clientSecret: TWITCH_CLIENT_SECRET,
        apiBaseUrl: TWITCH_API_BASE_URL ?? "https://api.twitch.tv/helix",
        authUrl: TWITCH_AUTH_URL ?? "https://id.twitch.tv/oauth2/token",
        shared: sharedCache(),
      })
    : null;
}

/**
 * Every streaming site with keys set. Each is a StreamDirectory; the services merge them, so
 * another site (Kick) only needs an adapter here.
 */
function directories(): StreamDirectory[] {
  return [twitchDirectory()].filter((d): d is TwitchDirectory => d !== null);
}

// One per server instance, so app tokens and caches are shared.
const sites = lazy(() => ({ directories: directories() }));

export const liveService = lazy(
  () =>
    new LiveService({
      source: new OpenDotaLiveSource(openDotaGateway(), openDotaConfig()),
      directories: sites.directories,
    }),
);

export const streamerFollowsRepository = new StreamerFollowsRepository(getDb);

export const streamerFollowService = lazy(
  () =>
    new StreamerFollowService({
      repository: streamerFollowsRepository,
      directories: sites.directories,
      data: streamerFollowsRepository,
    }),
);

export const liveController = new LiveController({
  live: liveService,
  follows: streamerFollowService,
});
