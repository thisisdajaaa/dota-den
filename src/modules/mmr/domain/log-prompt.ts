/**
 * When to ask for an MMR entry (pure). A change is exact only when two entries bracket
 * exactly the ranked games between them (ADR 0007), so logging right after each ranked game
 * gives an exact change for every game.
 */

export interface LogPrompt {
  /** Ranked games that started after the latest entry. */
  gamesSince: number;
  /** The newest of those games (to remember a dismissal until the next game). */
  newestGameId: string;
  last: { mmr: number; observedAt: Date } | null;
  /** Logging now would make this one game's change exact. */
  exactIfLoggedNow: boolean;
}

export function logPrompt(
  latestEntry: { mmr: number; observedAt: Date } | null,
  rankedGames: readonly { matchId: string; startedAt: Date }[],
): LogPrompt | null {
  const since = latestEntry
    ? rankedGames.filter((g) => g.startedAt.getTime() > latestEntry.observedAt.getTime())
    : rankedGames;
  if (since.length === 0) return null;
  const newest = [...since].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  return {
    gamesSince: since.length,
    newestGameId: newest.matchId,
    last: latestEntry,
    exactIfLoggedNow: latestEntry !== null && since.length === 1,
  };
}
