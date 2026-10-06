import "server-only";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { matchesService } from "@/modules/matches";
import { OpenDotaPlayerDirectory, steamAvatar } from "./infrastructure/opendota-player-directory";
import { PlayersController } from "./players.controller";
import { FollowsRepository } from "./repositories/follows.repository";
import { FollowService } from "./services/follow.service";
import { PlayersService } from "./services/players.service";

export const followsRepository = new FollowsRepository(getDb);
export const followService = new FollowService(followsRepository, { data: followsRepository });

/** The shared OpenDota gateway: one cache, dedup and circuit breaker for the whole app. */
export const playerDirectory = lazy(
  () => new OpenDotaPlayerDirectory(openDotaGateway(), openDotaConfig()),
);

export const playersService = lazy(
  () =>
    new PlayersService({
      directory: playerDirectory,
      profiles: {
        fetchPlayerProfile: (id) => matchesService.profile(id),
        recentMatches: (id, limit) => matchesService.publicRecentMatches(id, limit),
      },
      follows: followService,
      safeAvatar: steamAvatar,
      logger,
    }),
);

export const playersController = new PlayersController({ follows: followService });
