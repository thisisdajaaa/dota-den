import { mapLimit } from "@/common/utils/map-limit";
import { adminTotals } from "./domain/overview";
import { retention } from "./domain/retention";
import type {
  AdminActivitySource,
  AdminOptInSource,
  AdminOpsSource,
  AdminProfileSource,
  AdminStatsSource,
  AdminUserSource,
} from "./admin.ports";
import type { AdminOverviewDto } from "./dtos/responses/admin-overview.dto";

/** Profiles are looked up on OpenDota: a few at a time. */
const PROFILE_CONCURRENCY = 4;

/** Admins only (the caller checks the role): who uses Dota Den and how. */
export class AdminService {
  constructor(
    private readonly deps: {
      users: AdminUserSource;
      stats: AdminStatsSource;
      profiles: AdminProfileSource;
      ops: AdminOpsSource;
      activity: AdminActivitySource;
      optIns: AdminOptInSource;
    },
  ) {}

  async overview(now = new Date()): Promise<AdminOverviewDto> {
    const { users: userSource, stats, profiles, ops } = this.deps;
    const users = await userSource.userRows();
    const userIds = users.map((u) => u.userId);
    const accountIds = users.map((u) => u.accountId32);
    const [
      matches,
      mmr,
      activity,
      rooms,
      jobFailures,
      errors,
      cronRuns,
      profileList,
      activeDays,
      notified,
      emailed,
      discordFeeds,
    ] = await Promise.all([
      stats.matchStats(accountIds),
      stats.mmrEntryCounts(userIds),
      stats.activityCounts(userIds),
      stats.roomDraftCounts(userIds),
      ops.jobFailures().catch(() => []),
      ops.errorGroups(7).catch(() => null),
      ops.cronRuns(10).catch(() => null),
      mapLimit(accountIds, PROFILE_CONCURRENCY, (id) =>
        profiles.publicProfile(id).catch(() => null),
      ),
      this.deps.activity.activeDays(userIds).catch(() => null),
      this.deps.optIns.notifications().catch(() => null),
      this.deps.optIns.email().catch(() => null),
      this.deps.optIns.discord().catch(() => null),
    ]);
    // Count current players only (a deleted account's row may linger briefly).
    const count = (ids: string[] | null) =>
      ids ? new Set(ids.filter((id) => userIds.includes(id))).size : null;
    const rows = users
      .map((u, i) => ({
        ...u,
        profile: profileList[i],
        stats: matches.get(u.accountId32),
        mmrEntries: mmr.get(u.userId) ?? 0,
        drafts: activity.get(u.userId)?.drafts ?? 0,
        challenges: activity.get(u.userId)?.challenges ?? 0,
        roomDrafts: rooms.get(u.userId) ?? 0,
      }))
      .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0));
    return {
      totals: adminTotals(
        rows.map((r) => ({
          createdAt: r.createdAt,
          lastSeenAt: r.lastSeenAt,
          matches: r.stats?.matches ?? 0,
          profileVisibility: r.profileVisibility,
        })),
        now,
      ),
      retention: activeDays
        ? retention(
            users.map((u) => ({
              createdAt: u.createdAt,
              activeDays: activeDays.get(u.userId) ?? [],
            })),
            now,
          )
        : null,
      optIns: {
        notifications: count(notified),
        email: count(emailed),
        discord: count(discordFeeds),
      },
      users: rows,
      jobFailures,
      cronRuns,
      errors,
    };
  }
}
