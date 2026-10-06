import type { ErrorGroup } from "@/modules/errors";
import type { AdminTotals } from "../../domain/overview";
import type { AdminProfileSource, CronRunView, JobFailureView } from "../../admin.ports";

export interface AdminUserRowDto {
  userId: string;
  accountId32: number;
  createdAt: Date;
  isAdmin: boolean;
  profileVisibility: string;
  sessions: number;
  lastSeenAt: Date | null;
  profile: Awaited<ReturnType<AdminProfileSource["publicProfile"]>>;
  stats: { matches: number; lastSyncAt: Date | null; backfillComplete: boolean } | undefined;
  mmrEntries: number;
  drafts: number;
  challenges: number;
  roomDrafts: number;
}

/** Everything the admin page shows. Sections that failed to load are null. */
export interface AdminOverviewDto {
  totals: AdminTotals;
  /** Most recently active first. */
  users: AdminUserRowDto[];
  jobFailures: JobFailureView[];
  cronRuns: CronRunView[] | null;
  errors: ErrorGroup[] | null;
}
