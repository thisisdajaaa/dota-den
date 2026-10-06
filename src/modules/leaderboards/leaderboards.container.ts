import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { draftHistoryService } from "@/modules/drafts";
import { usersService, type User } from "@/modules/identity";
import { followService, ownerOf, playerDirectory, playersService } from "@/modules/players";
import { draftsReferee } from "./infrastructure/drafts-referee";
import { bestHeroThisWeek, rankedWeekFor } from "./infrastructure/opendota-ranked-week";
import { LeaderboardsController } from "./leaderboards.controller";
import type { AccountDirectory, PlayerAccount } from "./leaderboards.ports";
import { ActivityRepository } from "./repositories/activity.repository";
import { ActivityService } from "./services/activity.service";
import { FriendsLookupService } from "./services/friends-lookup.service";
import { LeaderboardService } from "./services/leaderboard.service";
import { RankedWeekService } from "./services/ranked-week.service";

export const activityRepository = new ActivityRepository(getDb);

export const activityService = new ActivityService({
  repo: activityRepository,
  referee: draftsReferee,
  hash: (text) => createHash("sha256").update(text).digest("hex"),
  onScoreError: (error) => logger.warn("draft_score_failed", { error }),
  data: activityRepository,
});

const friends = new FriendsLookupService({
  tracked: (viewer) =>
    followService.list(ownerOf({ id: viewer.userId, accountId32: viewer.accountId32 })),
  peers: (id) => playerDirectory.peers(id),
  roomOpponents: async (userId, limit) => draftHistoryService.opponents(userId, limit),
  logger,
});

const toAccount = (u: User): PlayerAccount => ({
  userId: u.id,
  accountId32: u.accountId32,
  name: u.persona?.name ?? null,
  avatarUrl: u.persona?.avatarUrl ?? null,
});

const accounts: AccountDirectory = {
  byUserIds: async (ids) => (await usersService.findByIds(ids)).map(toAccount),
  byAccountIds: async (ids) => (await usersService.findByAccountIds(ids)).map(toAccount),
  publicUserIds: () => usersService.findPublicIds(env().LEADERBOARD_EVERYONE_MAX_PLAYERS),
};

export const leaderboardService = lazy(
  () =>
    new LeaderboardService({
      activity: activityRepository,
      rooms: { totals: async (query) => draftHistoryService.captainTotals(query) },
      accounts,
      profiles: {
        profile: async (accountId32) => {
          const p = await playersService.publicProfile(accountId32);
          return p
            ? {
                personaName: p.personaName,
                avatarUrl: p.avatarUrl,
                rankTier: p.rankTier,
                leaderboardRank: p.leaderboardRank,
              }
            : null;
        },
      },
      friends,
      rowLimit: env().LEADERBOARD_ROW_LIMIT,
    }),
);

export const rankedWeekService = new RankedWeekService({
  friends,
  week: {
    recordFor: (id) => rankedWeekFor(openDotaGateway(), openDotaConfig(), id),
    bestHero: (id) => bestHeroThisWeek(openDotaGateway(), openDotaConfig(), id),
  },
  profiles: playersService,
});

export const leaderboardsController = new LeaderboardsController({ activity: activityService });
