import "server-only";
import { env } from "@/common/config/env";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { OpenDotaLiveSource } from "./infrastructure/opendota-live-source";
import { TwitchStreamSource } from "./infrastructure/twitch-stream-source";
import { lazy } from "@/common/utils/lazy";
import { LiveService } from "./live.service";

/** Twitch is optional: without keys the watch section falls back to search links. */
function twitchSource(): TwitchStreamSource | null {
  const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_API_BASE_URL, TWITCH_AUTH_URL } = env();
  return TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET
    ? new TwitchStreamSource({
        clientId: TWITCH_CLIENT_ID,
        clientSecret: TWITCH_CLIENT_SECRET,
        apiBaseUrl: TWITCH_API_BASE_URL ?? "https://api.twitch.tv/helix",
        authUrl: TWITCH_AUTH_URL ?? "https://id.twitch.tv/oauth2/token",
      })
    : null;
}

// One per server instance, so the Twitch app token and stream cache are shared.
export const liveService = lazy(
  () =>
    new LiveService({
      source: new OpenDotaLiveSource(openDotaGateway(), openDotaConfig()),
      streams: twitchSource(),
    }),
);
