import type { DataOwner } from "@/common/privacy/user-data";
import type { HeroPick, WinRate } from "./domain/practice-plan";
import type { PracticePlan } from "./practice.model";

export interface PracticeRepositoryPort {
  find(userId: string, week: string): Promise<PracticePlan | null>;
  /** Stores the plan unless one exists for the week already; returns the stored one. */
  insertIfAbsent(plan: PracticePlan): Promise<PracticePlan>;
  save(plan: PracticePlan): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** A ranked game as the plan reads it. */
export interface PlanGame {
  matchId: string;
  startedAt: Date;
  result: "win" | "loss";
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
}

/** Sessions grouped like the Sessions page, ranked games only (from the sessions feature). */
export interface RankedSessionsSource {
  rankedSessions(
    owner: DataOwner,
  ): Promise<Array<{ startedAt: Date; endedAt: Date; matches: PlanGame[] }>>;
}

/** When the player logged MMR (from the MMR feature). */
export interface MmrLogSource {
  entryTimes(owner: DataOwner): Promise<Date[]>;
}

/** Win rate after losing streaks against the usual one (from the sessions feature). */
export interface TiltSource {
  tilt(owner: DataOwner): Promise<{ baseline: WinRate; afterTwo: WinRate }>;
}

/** Heroes worth adding for the player's role (from the advisor feature). */
export interface HeroAdviceSource {
  advice(
    accountId32: number,
  ): Promise<
    | { status: "ok"; position: number; picks: HeroPick[] }
    | { status: "no_role" }
    | { status: "unavailable" }
  >;
}

/** Which of these matches the player has reviewed: a note or the "reviewed" tag. */
export interface ReviewSource {
  reviewed(userId: string, matchIds: readonly string[]): Promise<Set<string>>;
}
