import type { Result } from "@/common/result";
import type { ChallengeAttempt, ChallengeStreak, DraftResult } from "./domain/activity";
import type { OutlookLike } from "./domain/draft-score";
import type { ChallengeTotals, DraftTotals, RoomTotals } from "./domain/ranking";

/** Which activity to total: since a date (null = all time), for some players (null = all). */
export interface TotalsQuery {
  since: Date | null;
  userIds: readonly string[] | null;
}

/** This context's own records (collections `challenge_attempts`, `challenge_streaks`, `draft_results`). */
export interface ActivityPort {
  /** Keep the first answer to a puzzle per player (unique on user, type and seed). */
  insertAttempt(attempt: ChallengeAttempt): Promise<"inserted" | "duplicate">;
  /** Apply one counted answer to the player's streak, atomically. Returns the new streak. */
  applyToStreak(userId: string, correct: boolean, at: Date): Promise<ChallengeStreak>;
  streakOf(userId: string): Promise<ChallengeStreak>;
  /** Keep a finished draft once per player (unique on user and snapshot hash). */
  insertDraft(result: DraftResult): Promise<"inserted" | "duplicate">;
  draftTotals(query: TotalsQuery): Promise<DraftTotals[]>;
  challengeTotals(query: TotalsQuery): Promise<ChallengeTotals[]>;
}

/** Room drafts, read from the drafts context's permanent history (never duplicated here). */
export interface RoomActivitySource {
  totals(query: TotalsQuery): Promise<RoomTotals[]>;
}

/** A Dota Den account, from the identity context. */
export interface PlayerAccount {
  userId: string;
  accountId32: number;
  /** The persona saved at sign-in, if any (a fallback when OpenDota can't be reached). */
  name: string | null;
  avatarUrl: string | null;
}

export interface AccountDirectory {
  byUserIds(userIds: readonly string[]): Promise<PlayerAccount[]>;
  /** Only the accounts that exist: most friends won't have a Dota Den account. */
  byAccountIds(accountIds: readonly number[]): Promise<PlayerAccount[]>;
  /** Users who chose to be listed publicly: the only ones on the Everyone boards. */
  publicUserIds(): Promise<string[]>;
}

/** A player's public profile (OpenDota via the players context); null when unavailable. */
export interface PublicProfile {
  personaName: string | null;
  avatarUrl: string | null;
  rankTier: number | null;
  leaderboardRank: number | null;
}

export interface ProfileLookup {
  profile(accountId32: number): Promise<PublicProfile | null>;
}

/**
 * The viewer's friends as Steam account ids: tracked players, OpenDota teammates and room
 * captains they've drafted with. `incomplete` when a source couldn't be loaded.
 */
export interface FriendFinder {
  friendAccountIds(viewer: {
    userId: string;
    accountId32: number;
  }): Promise<{ accountIds: number[]; incomplete: boolean }>;
}

export type RefereeError = { type: "invalid_snapshot" } | { type: "heroes_unavailable" };

/** Checks a finished draft by replaying it through the drafts context's engine. */
export interface DraftReferee {
  replay(encoded: string): Promise<
    Result<
      {
        /** The snapshot re-encoded from the replayed draft (one spelling per draft). */
        canonical: string;
        completed: boolean;
        rulesetId: string;
        rulesetVersion: number;
      },
      RefereeError
    >
  >;
  /** The draft outlook for a canonical snapshot, or null when it can't be estimated. */
  outlook(canonical: string): Promise<OutlookLike | null>;
}
