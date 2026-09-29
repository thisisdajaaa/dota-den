import type { PlaySession } from "./session";

/**
 * MMR change for a session (ADR 0007 rules applied to a session instead of a day):
 * - exact: the user's own entries bracket the session (one at/before its start, one at/after
 *   its end) and no other ranked game was played between those two entries;
 * - estimate: otherwise, ±`estimatePerGame` per ranked win/loss, always labelled;
 * - none: the session has no ranked games, so there is nothing to attribute.
 * An estimate is never presented as an exact value.
 */
export interface MmrObservation {
  observedAt: Date;
  mmr: number;
}

export interface RankedGame {
  matchId: string;
  startedAt: Date;
}

export type SessionMmr =
  | { kind: "exact"; delta: number; from: MmrObservation; to: MmrObservation }
  | {
      kind: "estimate";
      delta: number;
      rankedGames: number;
      /** MMR assumed per ranked win/loss. */
      perGame: number;
      /** Why it isn't exact, in plain language. */
      reason: "no_entries" | "not_bracketed" | "other_games_between";
    }
  | { kind: "none" };

export function sessionMmr(input: {
  session: Pick<PlaySession, "startedAt" | "endedAt" | "matches">;
  observations: readonly MmrObservation[];
  /** Every ranked game on the account (any order); used to check nothing else sits between. */
  rankedGames: readonly RankedGame[];
  estimatePerGame: number;
}): SessionMmr {
  const { session, estimatePerGame } = input;
  const ranked = session.matches.filter((m) => m.ranked);
  if (ranked.length === 0) return { kind: "none" };

  const wins = ranked.filter((m) => m.result === "win").length;
  const estimate = (reason: "no_entries" | "not_bracketed" | "other_games_between") => ({
    kind: "estimate" as const,
    delta: (wins - (ranked.length - wins)) * estimatePerGame,
    rankedGames: ranked.length,
    perGame: estimatePerGame,
    reason,
  });

  if (input.observations.length === 0) return estimate("no_entries");
  const obs = [...input.observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const start = session.startedAt.getTime();
  const end = session.endedAt.getTime();
  const from = obs.filter((o) => o.observedAt.getTime() <= start).at(-1);
  const to = obs.find((o) => o.observedAt.getTime() >= end);
  if (!from || !to) return estimate("not_bracketed");

  // The session's own games all lie between the two entries; any other ranked game in that
  // window would also have moved MMR, so the difference couldn't be pinned on this session.
  // A game starting at the same instant as an entry counts as after it (the entry was seen
  // before queueing).
  const own = new Set(ranked.map((m) => m.matchId));
  const otherBetween = input.rankedGames.some(
    (g) =>
      !own.has(g.matchId) &&
      g.startedAt.getTime() >= from.observedAt.getTime() &&
      g.startedAt.getTime() <= to.observedAt.getTime(),
  );
  if (otherBetween) return estimate("other_games_between");

  return { kind: "exact", delta: to.mmr - from.mmr, from, to };
}
