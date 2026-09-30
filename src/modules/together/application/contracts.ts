import type { BestTeammate, QueueMix, TeammateStat, WinLossTotals } from "../domain/teammates";

/** Friends shown on /together; public upstream data plus our own cached classifications. */
export const MAX_PEER_CANDIDATES = 15;
/** Tracked players (not already among peers) looked up per page view. */
export const MAX_TRACKED_CANDIDATES = 10;

export interface FriendCandidate {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
  /** OpenDota's count of games on the same team (not necessarily queued together). */
  sameTeamGames: number | null;
  /** Confirmed party games among the matches analysed so far. */
  partyGames: number;
  lastPlayedAt: Date | null;
  source: "peer" | "tracked";
}

/** Most confirmed parties first, then most games on the same team. */
export function sortCandidates(xs: readonly FriendCandidate[]): FriendCandidate[] {
  return [...xs].sort(
    (a, b) =>
      b.partyGames - a.partyGames ||
      (b.sameTeamGames ?? 0) - (a.sameTeamGames ?? 0) ||
      a.accountId32 - b.accountId32,
  );
}

/** Teammates listed on the overview; each costs one cached profile lookup (for the rank). */
export const MAX_OVERVIEW_TEAMMATES = 12;

/** A teammate or rival with public profile details, for the overview's Teammates section. */
export interface TeammateView extends TeammateStat {
  personaName: string | null;
  avatarUrl: string | null;
  rankTier: number | null;
  leaderboardRank: number | null;
  /** Confirmed party games among matches analysed on /together so far. */
  confirmedParties: number;
}

export interface TeammatesOverview {
  teammates: TeammateView[];
  best: (Omit<BestTeammate, "teammate"> & { teammate: TeammateView }) | null;
  mostPlayed: TeammateView | null;
  rivals: TeammateView[];
  queueMix: QueueMix;
  /** Your all-time public record; null when OpenDota couldn't provide it. */
  overall: WinLossTotals | null;
}
