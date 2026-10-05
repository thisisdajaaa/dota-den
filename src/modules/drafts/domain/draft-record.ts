/**
 * Did the draft decide it? (pure). For a player's real ranked games, the draft outlook's
 * estimate for their side, bucketed, against what actually happened. The outlook is an
 * estimate (about 57% accurate on held-out games), so this is a read, not a verdict.
 */

export interface GradedGame {
  yourSide: "radiant" | "dire";
  won: boolean;
  /** The outlook's Radiant win chance from the draft, 0–100. */
  radiantPct: number;
}

export interface Record_ {
  games: number;
  wins: number;
}

export interface DraftRecord {
  graded: number;
  /** Your side's estimate ≥ 53%. */
  favoured: Record_;
  /** 48–52%: too close to call. */
  even: Record_;
  /** ≤ 47%. */
  against: Record_;
  /** Games with a favoured side (not even), and how often that side won. */
  favouredSideWon: Record_;
}

export const FAVOURED_MIN = 53;
export const AGAINST_MAX = 47;

export function draftRecord(games: readonly GradedGame[]): DraftRecord {
  const empty = (): Record_ => ({ games: 0, wins: 0 });
  const out: DraftRecord = {
    graded: games.length,
    favoured: empty(),
    even: empty(),
    against: empty(),
    favouredSideWon: empty(),
  };
  for (const g of games) {
    const yours = g.yourSide === "radiant" ? g.radiantPct : 100 - g.radiantPct;
    const bucket =
      yours >= FAVOURED_MIN ? out.favoured : yours <= AGAINST_MAX ? out.against : out.even;
    bucket.games++;
    if (g.won) bucket.wins++;
    if (g.radiantPct !== 50 && bucket !== out.even) {
      out.favouredSideWon.games++;
      // The favoured side won when you were favoured and won, or against and lost.
      if (yours > 50 === g.won) out.favouredSideWon.wins++;
    }
  }
  return out;
}
