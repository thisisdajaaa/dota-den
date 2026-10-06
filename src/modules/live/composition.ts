import "server-only";
import { env } from "@/common/config/env";
import { openDotaGateway } from "@/modules/matches/composition";
import { LiveService } from "./application/live-service";
import { OpenDotaLiveSource } from "./infrastructure/opendota-live-source";
import { TwitchStreamSource } from "./infrastructure/twitch-stream-source";

// One per server instance, so the app token and stream cache are shared across requests.
let twitch: TwitchStreamSource | null | undefined;
function twitchSource(): TwitchStreamSource | null {
  if (twitch !== undefined) return twitch;
  const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_API_BASE_URL, TWITCH_AUTH_URL } = env();
  twitch =
    TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET
      ? new TwitchStreamSource({
          clientId: TWITCH_CLIENT_ID,
          clientSecret: TWITCH_CLIENT_SECRET,
          apiBaseUrl: TWITCH_API_BASE_URL ?? "https://api.twitch.tv/helix",
          authUrl: TWITCH_AUTH_URL ?? "https://id.twitch.tv/oauth2/token",
        })
      : null;
  return twitch;
}

export function getLiveService(): LiveService {
  const { OPENDOTA_API_KEY, OPENDOTA_BASE_URL } = env();
  return new LiveService({
    source: new OpenDotaLiveSource(openDotaGateway(), {
      baseUrl: OPENDOTA_BASE_URL ?? "https://api.opendota.com/api",
      apiKey: OPENDOTA_API_KEY,
    }),
    streams: twitchSource(),
  });
}
