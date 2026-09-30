/**
 * How two players shared a match. Only `party` is "played together" (spec §2.2: shared match
 * detection uses known party membership, not merely appearing on the same team).
 *
 * - `party`: same team and the same reported party (queued together).
 * - `same_team_separate`: same team, and the upstream says they were not in one party
 *   (different party ids, or either queued alone).
 * - `same_team_unknown`: same team, but party data is missing for at least one of them.
 * - `opponents`: different teams.
 * - `undetermined`: the match detail was unavailable or one of them isn't in it (anonymous).
 */
export type Relation =
  "party" | "same_team_separate" | "same_team_unknown" | "opponents" | "undetermined";

export type Side = "radiant" | "dire";

/** One player's seat in a match, as the upstream match detail reports it. */
export interface Seat {
  side: Side;
  heroId: number;
  partyId: number | null;
  partySize: number | null;
}

/**
 * Classify a pair from their seats. Mirrors the match page's party rule: a party needs a
 * shared party id AND a reported party size of at least 2 for both players. Missing data is
 * never treated as a party.
 */
export function classifyRelation(a: Seat | null, b: Seat | null): Relation {
  if (!a || !b) return "undetermined";
  if (a.side !== b.side) return "opponents";
  // A reported party size of 1 means queued alone, whatever the id.
  if (a.partySize === 1 || b.partySize === 1) return "same_team_separate";
  const known = (s: Seat) => s.partyId !== null && s.partySize !== null && s.partySize >= 2;
  if (!known(a) || !known(b)) return "same_team_unknown";
  return a.partyId === b.partyId ? "party" : "same_team_separate";
}

/** Whether the relation counts toward "played together" stats. */
export const countsAsTogether = (r: Relation): boolean => r === "party";
