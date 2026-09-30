import type { Relation, Seat } from "./relation";

/** An unordered pair of accounts, stored in a canonical order (A < B) so each pair has one key. */
export interface AccountPair {
  accountIdA: number;
  accountIdB: number;
}

export function pairOf(x: number, y: number): AccountPair {
  if (x === y) throw new Error("A pair needs two different accounts");
  return x < y ? { accountIdA: x, accountIdB: y } : { accountIdA: y, accountIdB: x };
}

/** The other account in the pair. */
export function otherOf(pair: AccountPair, accountId32: number): number {
  return pair.accountIdA === accountId32 ? pair.accountIdB : pair.accountIdA;
}

/** A classified shared match for one pair (the cache record). */
export interface PairClassification extends AccountPair {
  matchId: string;
  relation: Relation;
  startedAt: Date;
  /** null when the match detail was unavailable. */
  radiantWin: boolean | null;
  seatA: Seat | null;
  seatB: Seat | null;
  fetchedAt: Date;
}

/** The seat of `accountId32` in a classification (null if it isn't part of the pair). */
export function seatOf(c: PairClassification, accountId32: number): Seat | null {
  if (c.accountIdA === accountId32) return c.seatA;
  if (c.accountIdB === accountId32) return c.seatB;
  return null;
}

/** Win/loss for `accountId32` in a classified match, when known. */
export function resultFor(c: PairClassification, accountId32: number): "win" | "loss" | null {
  const seat = seatOf(c, accountId32);
  if (!seat || c.radiantWin === null) return null;
  return (seat.side === "radiant") === c.radiantWin ? "win" : "loss";
}
