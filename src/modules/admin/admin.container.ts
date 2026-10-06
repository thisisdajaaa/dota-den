import "server-only";
import { getRoomDraftCounts } from "@/modules/drafts/composition";
import { errorsService } from "@/modules/errors";
import { usersService } from "@/modules/identity";
import { cronRunsRepository, jobRunsRepository } from "@/modules/jobs";
import { activityRepository } from "@/modules/leaderboards";
import { matchesService } from "@/modules/matches";
import { mmrEntriesRepository } from "@/modules/mmr";
import { AdminService } from "./admin.service";
import { playersService } from "@/modules/players";

export const adminService = new AdminService({
  users: { userRows: () => usersService.adminRows() },
  stats: {
    matchStats: (ids) => matchesService.statsByAccount(ids),
    mmrEntryCounts: (ids) => mmrEntriesRepository.countsByUser(ids),
    activityCounts: (ids) => activityRepository.countsByUser(ids),
    roomDraftCounts: getRoomDraftCounts,
  },
  profiles: { publicProfile: (id) => playersService.publicProfile(id) },
  ops: {
    jobFailures: () => jobRunsRepository.recentFailures(),
    cronRuns: (limit) => cronRunsRepository.recent(limit),
    errorGroups: (days) => errorsService.recentGroups(days),
  },
});
