import "server-only";
import { getRoomDraftCounts } from "@/modules/drafts/composition";
import { errorsService } from "@/modules/errors";
import { usersService } from "@/modules/identity";
import { cronRunsRepository, jobRunsRepository } from "@/modules/jobs";
import { getActivityCounts } from "@/modules/leaderboards/composition";
import { getMatchStatsByAccount } from "@/modules/matches/composition";
import { getMmrEntryCounts } from "@/modules/mmr/composition";
import { AdminService } from "./admin.service";
import { playersService } from "@/modules/players";

export const adminService = new AdminService({
  users: { userRows: () => usersService.adminRows() },
  stats: {
    matchStats: getMatchStatsByAccount,
    mmrEntryCounts: getMmrEntryCounts,
    activityCounts: getActivityCounts,
    roomDraftCounts: getRoomDraftCounts,
  },
  profiles: { publicProfile: (id) => playersService.publicProfile(id) },
  ops: {
    jobFailures: () => jobRunsRepository.recentFailures(),
    cronRuns: (limit) => cronRunsRepository.recent(limit),
    errorGroups: (days) => errorsService.recentGroups(days),
  },
});
