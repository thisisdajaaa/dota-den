import "server-only";
import { draftHistoryRepository } from "@/modules/drafts";
import { errorsService } from "@/modules/errors";
import { usersService } from "@/modules/identity";
import { cronRunsRepository, jobRunsRepository } from "@/modules/jobs";
import { activityRepository } from "@/modules/leaderboards";
import { matchesService } from "@/modules/matches";
import { mmrEntriesRepository } from "@/modules/mmr";
import { notificationService } from "@/modules/notifications";
import { emailSubscriptionsRepository } from "@/modules/email";
import { discordWebhooksRepository } from "@/modules/discord";
import { AdminService } from "./admin.service";
import { playersService } from "@/modules/players";

export const adminService = new AdminService({
  users: { userRows: () => usersService.adminRows() },
  stats: {
    matchStats: (ids) => matchesService.statsByAccount(ids),
    mmrEntryCounts: (ids) => mmrEntriesRepository.countsByUser(ids),
    activityCounts: (ids) => activityRepository.countsByUser(ids),
    roomDraftCounts: (ids) => draftHistoryRepository.countsByUser(ids),
  },
  profiles: { publicProfile: (id) => playersService.publicProfile(id) },
  activity: { activeDays: (ids) => usersService.activeDays(ids) },
  optIns: {
    notifications: () => notificationService.subscribedUserIds(),
    email: async () => (await emailSubscriptionsRepository.confirmed()).map((s) => s.userId),
    discord: async () => (await discordWebhooksRepository.active()).map((f) => f.userId),
  },
  ops: {
    jobFailures: () => jobRunsRepository.recentFailures(),
    cronRuns: (limit) => cronRunsRepository.recent(limit),
    errorGroups: (days) => errorsService.recentGroups(days),
  },
});
