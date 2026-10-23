import "server-only";
import { getRedis } from "@/common/cache/redis";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { usersService } from "@/modules/identity";
import { notificationService } from "@/modules/notifications";
import { plusService } from "@/modules/plus";
import { OpenDotaLiveSource } from "./infrastructure/opendota-live-source";
import type { SharedCache } from "./infrastructure/directory-cache";
import { KickDirectory } from "./infrastructure/kick-directory";
import { TwitchDirectory } from "./infrastructure/twitch-directory";
import { LiveController } from "./live.controller";
import type { StreamDirectory } from "./live.ports";
import { LiveService } from "./live.service";
import { StreamerFollowsRepository } from "./repositories/streamer-follows.repository";
import { StreamerAlertsService } from "./streamer-alerts.service";
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

/** Kick is optional too: without keys the hub lists Twitch only. */
function kickDirectory(): KickDirectory | null {
  const { KICK_CLIENT_ID, KICK_CLIENT_SECRET, KICK_API_BASE_URL, KICK_AUTH_URL } = env();
  return KICK_CLIENT_ID && KICK_CLIENT_SECRET
    ? new KickDirectory({
        clientId: KICK_CLIENT_ID,
        clientSecret: KICK_CLIENT_SECRET,
        apiBaseUrl: KICK_API_BASE_URL ?? "https://api.kick.com/public/v1",
        authUrl: KICK_AUTH_URL ?? "https://id.kick.com/oauth/token",
        shared: sharedCache(),
      })
    : null;
}

/**
 * Every streaming site with keys set, in display order. Each is a StreamDirectory; the
 * services merge them, and one site being down still shows the others.
 */
function directories(): StreamDirectory[] {
  const configured: (StreamDirectory | null)[] = [twitchDirectory(), kickDirectory()];
  return configured.filter((d): d is StreamDirectory => d !== null);
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
      // Plus doubles the cap (ADR 0013).
      limitFor: (userId, base) => plusService.limit(userId, base),
    }),
);

/** Go-live alerts for Plus players (ADR 0013), run by the `streamer-alerts` job. */
export const streamerAlerts = lazy(
  () =>
    new StreamerAlertsService({
      plusUserIds: () => plusService.plusUserIds(),
      notifications: {
        get enabled() {
          return notificationService.enabled;
        },
        subscribedUserIds: () => notificationService.subscribedUserIds(),
        wants: async (userId) => (await notificationService.prefs(userId)).streamer_live,
        notifyOnce: (userId, key, build) =>
          notificationService.notifyOnce(userId, "streamer_live", key, build),
      },
      follows: streamerFollowsRepository,
      directories: sites.directories,
      languages: async (ids) =>
        new Map(
          (await usersService.findByIds(ids)).map((u) => [u.id, u.settings.language ?? null]),
        ),
      logger,
    }),
);

export const liveController = new LiveController({
  live: liveService,
  follows: streamerFollowService,
});
