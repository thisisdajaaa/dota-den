import type { DataOwner } from "@/common/privacy/user-data";
import type { Goal } from "./domain/goals";

export interface GoalsRepositoryPort {
  findGoals(userId: string, week: string): Promise<Goal[]>;
  /** Replaces the week's goals; an empty list removes them. */
  saveGoals(userId: string, week: string, goals: Goal[]): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** Sessions grouped like the Sessions page, ranked games only (from the sessions feature). */
export interface RankedSessionsSource {
  rankedSessions(owner: DataOwner): Promise<
    Array<{
      startedAt: Date;
      endedAt: Date;
      matches: Array<{ startedAt: Date; result: "win" | "loss"; heroId: number }>;
    }>
  >;
}

/** When the player logged MMR (from the MMR feature). */
export interface MmrLogSource {
  entryTimes(owner: DataOwner): Promise<Date[]>;
}
