import "server-only";
import { getRoomDraftCounts } from "@/modules/drafts/composition";
import { errorsService } from "@/modules/errors";
import { getAdminUserRows } from "@/modules/identity/composition";
import { getCronRuns, getRecentJobFailures } from "@/modules/jobs/composition";
import { getActivityCounts } from "@/modules/leaderboards/composition";
import { getMatchStatsByAccount } from "@/modules/matches/composition";
import { getMmrEntryCounts } from "@/modules/mmr/composition";
import { getPublicProfile } from "@/modules/players/composition";
import { AdminService } from "./admin.service";

export const adminService = new AdminService({
  users: { userRows: getAdminUserRows },
  stats: {
    matchStats: getMatchStatsByAccount,
    mmrEntryCounts: getMmrEntryCounts,
    activityCounts: getActivityCounts,
    roomDraftCounts: getRoomDraftCounts,
  },
  profiles: { publicProfile: getPublicProfile },
  ops: {
    jobFailures: getRecentJobFailures,
    cronRuns: getCronRuns,
    errorGroups: (days) => errorsService.recentGroups(days),
  },
});
