/** Candidate friends on /together, and how they are ordered (pure). */

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
