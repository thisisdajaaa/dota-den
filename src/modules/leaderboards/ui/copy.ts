import type { Period } from "../domain/period";
import type { BoardKind, Scope } from "../domain/ranking";

// Board, scope and period labels, board rules and units live in the `leaderboards` messages
// (leaderboards.boards.<kind>, .scopes.<scope>, .periods.<period>, .rules.<kind>, .units.<kind>).

export function leaderboardHref(opts: { board: BoardKind; scope: Scope; period: Period }): string {
  const params = new URLSearchParams({ board: opts.board, scope: opts.scope, period: opts.period });
  return `/leaderboards?${params.toString()}`;
}
