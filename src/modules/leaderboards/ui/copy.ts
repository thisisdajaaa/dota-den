import type { Period } from "../domain/period";
import type { BoardKind, Scope } from "../domain/ranking";

export const BOARD_LABEL: Record<BoardKind, string> = {
  drafts: "Draft games",
  challenges: "Draft challenges",
  rooms: "Friend rooms",
};

export const SCOPE_LABEL: Record<Scope, string> = { friends: "Friends", everyone: "Everyone" };

export const PERIOD_LABEL: Record<Period, string> = { week: "This week", all: "All time" };

/** How each board ranks players, in plain words. */
export const BOARD_RULES: Record<BoardKind, string> = {
  drafts:
    "Ranked by finished drafts against the AI captain or in practice, then by best draft score. The draft score is your side's report card score from the draft outlook (0–100, 50 is average). Practice drafts, where you play both sides, have no score.",
  challenges:
    "Ranked by correct answers (graded Good or Excellent), then by best streak. Only your first answer to each puzzle counts.",
  rooms:
    "Ranked by finished room drafts, then by wins. Wins and losses are self-reported by the captains after the game and aren't verified; drafts with no reported result count as played only.",
};

/** The headline number on the overview's standing card. */
export const BOARD_UNIT: Record<BoardKind, [one: string, many: string]> = {
  drafts: ["draft", "drafts"],
  challenges: ["correct answer", "correct answers"],
  rooms: ["room draft", "room drafts"],
};

export function leaderboardHref(opts: { board: BoardKind; scope: Scope; period: Period }): string {
  const params = new URLSearchParams({ board: opts.board, scope: opts.scope, period: opts.period });
  return `/leaderboards?${params.toString()}`;
}
