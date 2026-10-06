import type { BestTeammate, QueueMix, TeammateStat, WinLossTotals } from "../../domain/teammates";

export {
  MAX_PEER_CANDIDATES,
  MAX_TRACKED_CANDIDATES,
  type FriendCandidate,
} from "../../domain/candidates";

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
