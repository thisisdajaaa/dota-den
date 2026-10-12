import "server-only";
import { logger } from "@/common/logging/logger";
import { steamGateway, steamWebApiConfig } from "@/common/providers/steam";
import { lazy } from "@/common/utils/lazy";
import { liveService } from "@/modules/live";
import { followService, ownerOf, playerDirectory } from "@/modules/players";
import { SteamPresenceAdapter } from "./infrastructure/steam-presence-adapter";
import { PresenceController } from "./presence.controller";
import { PresenceService } from "./presence.service";

/** Steam is optional: without STEAM_WEB_API_KEY the service answers "disabled". */
function steamSource(): SteamPresenceAdapter | null {
  const config = steamWebApiConfig();
  return config ? new SteamPresenceAdapter(steamGateway(), config) : null;
}

// Lazy: reads the environment, and the other features are only reached at call time.
export const presenceService = lazy(
  () =>
    new PresenceService({
      steam: steamSource(),
      known: {
        tracked: (viewer) =>
          followService.list(ownerOf({ id: viewer.userId, accountId32: viewer.accountId32 })),
        teammates: async (accountId32) => {
          const res = await playerDirectory.peers(accountId32);
          return res.ok ? res.value : null;
        },
      },
      live: { liveMatchIds: (ids) => liveService.liveMatchIds(ids) },
      logger,
    }),
);

export const presenceController = new PresenceController({ service: presenceService });
