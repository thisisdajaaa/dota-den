import type { DataOwner } from "@/common/privacy/user-data";
import type { AchievementGame } from "./domain/achievements";

/** Ranked games grouped into play sessions (from the sessions feature). */
export interface RankedSessionsSource {
  rankedSessions(owner: DataOwner): Promise<Array<{ matches: AchievementGame[] }>>;
}

/** When the player logged MMR (from the MMR feature). */
export interface MmrLogSource {
  entryTimes(owner: DataOwner): Promise<Date[]>;
}

/** Practice drafts and challenges per user (from the leaderboards feature). */
export interface ActivitySource {
  counts(userId: string): Promise<{ drafts: number; challenges: number }>;
}
