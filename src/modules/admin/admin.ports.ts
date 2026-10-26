import type { OpsReport, OwnerAlert } from "@/modules/alerts";
import type { ErrorGroup } from "@/modules/errors";
import type { CronRun, JobFailure } from "@/modules/jobs";
import type { FeatureUsage } from "@/modules/usage";

export interface AdminUserSource {
  /** Every user, with sign-in sessions counted. */
  userRows(): Promise<
    Array<{
      userId: string;
      accountId32: number;
      createdAt: Date;
      isAdmin: boolean;
      profileVisibility: string;
      sessions: number;
      lastSeenAt: Date | null;
    }>
  >;
}

/** Days each player was active (UTC "YYYY-MM-DD"). */
export interface AdminActivitySource {
  activeDays(userIds: readonly string[]): Promise<Map<string, string[]>>;
}

/** Who turned on each way of being reminded (user ids). */
export interface AdminOptInSource {
  notifications(): Promise<string[]>;
  /** Confirmed weekly email addresses. */
  email(): Promise<string[]>;
  /** Discord feeds that are on and still exist. */
  discord(): Promise<string[]>;
}

export interface AdminStatsSource {
  matchStats(
    accountIds: readonly number[],
  ): Promise<Map<number, { matches: number; lastSyncAt: Date | null; backfillComplete: boolean }>>;
  mmrEntryCounts(userIds: readonly string[]): Promise<Map<string, number>>;
  activityCounts(
    userIds: readonly string[],
  ): Promise<Map<string, { drafts: number; challenges: number }>>;
  roomDraftCounts(userIds: readonly string[]): Promise<Map<string, number>>;
  /** These players' ranked games started in [since, until), and how many have a parsed replay. */
  parseCounts(
    accountIds: readonly number[],
    since: Date,
    until: Date,
  ): Promise<{ games: number; parsed: number }>;
}

/** Uses of the paid and AI features. */
export interface AdminUsageSource {
  summary(): Promise<FeatureUsage[]>;
}

export interface AdminProfileSource {
  publicProfile(accountId32: number): Promise<{
    personaName: string | null;
    avatarUrl: string | null;
    rankTier: number | null;
    leaderboardRank: number | null;
  } | null>;
}

export type CronRunView = CronRun;
export type JobFailureView = JobFailure;
export type OwnerAlertView = OwnerAlert;
export type OpsReportView = OpsReport;

export interface AdminOpsSource {
  jobFailures(): Promise<JobFailureView[]>;
  cronRuns(limit: number): Promise<CronRunView[]>;
  errorGroups(days: number): Promise<ErrorGroup[]>;
  /** Owner alerts that went out, newest first. */
  alerts(limit: number): Promise<OwnerAlertView[]>;
  /** Backup and restore-drill outcomes, newest first. */
  opsReports(limit: number): Promise<OpsReportView[]>;
}
