import "server-only";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { matchQueries, matchesService, openDotaAdapter } from "@/modules/matches";
import { followService, playerDirectory, playersService } from "@/modules/players";
import { MatchDetailSeatReader } from "./infrastructure/match-seat-reader";
import { TogetherMatchesRepository } from "./repositories/together.repository";
import { FriendsService } from "./services/friends.service";
import { TogetherService } from "./together.service";

/** Shared matches considered per friend (OpenDota's most recent, one upstream call). */
export const SHARED_MATCH_LIMIT = 100;

export const togetherMatchesRepository = new TogetherMatchesRepository(getDb);

const ownFacts = async (accountId32: number) =>
  matchQueries.dashboardFacts(accountId32, { range: "all", mode: "all" }, new Date());

export const togetherService = lazy(
  () =>
    new TogetherService({
      finder: {
        sharedMatches: (me, friend) =>
          matchesService.publicRecentMatches(me, SHARED_MATCH_LIMIT, { includedAccountId: friend }),
      },
      seats: new MatchDetailSeatReader(openDotaAdapter),
      repo: togetherMatchesRepository,
      ownGames: {
        ownGames: async (me) =>
          (await ownFacts(me)).facts.map((f) => ({
            matchId: f.matchId,
            startedAt: f.startedAt,
            result: f.result,
          })),
      },
      data: togetherMatchesRepository,
    }),
);

export const friendsService = lazy(
  () =>
    new FriendsService({
      directory: playerDirectory,
      follows: followService,
      profiles: playersService,
      ownFacts,
      together: togetherService,
      logger,
    }),
);
