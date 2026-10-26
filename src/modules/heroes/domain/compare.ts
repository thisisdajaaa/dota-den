/**
 * How you compare (pure): your games on each hero against players at a rank on the same hero,
 * at the same game length. "At the same length" matters: a 45-minute game has more last hits
 * than a 25-minute one at any rank, so each of your games is set against what players at that
 * rank had by the same minute. Only your public match stats (every game has them, no replay
 * parsing needed) and STRATZ's per-minute averages.
 */

/**
 * Stats STRATZ and OpenDota count the same way. (XP and hero damage are left out: STRATZ's
 * per-minute averages for them don't line up with the match stats, so a comparison would
 * mislead.)
 */
export const COMPARE_STATS = ["lastHits", "fights", "deaths"] as const;
export type CompareStat = (typeof COMPARE_STATS)[number];

/** Dying less is better: fewer deaths than the rank is a good thing. */
export const LOWER_IS_BETTER: ReadonlySet<CompareStat> = new Set(["deaths"]);

export const RANK_BRACKETS = [
  "HERALD_GUARDIAN",
  "CRUSADER_ARCHON",
  "LEGEND_ANCIENT",
  "DIVINE_IMMORTAL",
] as const;
export type RankBracket = (typeof RANK_BRACKETS)[number];

export interface CompareGame {
  heroId: number;
  durationSec: number;
  lastHits: number | null;
  kills: number;
  assists: number;
  deaths: number;
}

/** What players at a rank had by each minute (averages over games still going then). */
export interface CurvePoint {
  minute: number;
  lastHits: number;
  /** Kills plus assists. */
  fights: number;
  deaths: number;
}

/** A hero needs this many of your games in the window to be compared. */
export const MIN_COMPARE_GAMES = 5;
/** Heroes compared, most played first. */
export const MAX_COMPARE_HEROES = 8;
/** Shorter games say little about farm or damage (abandons, stomps). */
const MIN_DURATION_SEC = 15 * 60;

/** The bracket of a rank medal (OpenDota's rank tier: 11–80), or null when unranked. */
export function bracketOf(rankTier: number | null | undefined): RankBracket | null {
  if (!rankTier || rankTier < 10) return null;
  const medal = Math.floor(rankTier / 10);
  return medal <= 2
    ? "HERALD_GUARDIAN"
    : medal <= 4
      ? "CRUSADER_ARCHON"
      : medal <= 6
        ? "LEGEND_ANCIENT"
        : "DIVINE_IMMORTAL";
}

/** The bracket above (the top one stays). */
export function nextBracket(b: RankBracket): RankBracket {
  return RANK_BRACKETS[Math.min(RANK_BRACKETS.indexOf(b) + 1, RANK_BRACKETS.length - 1)];
}

export interface StatGap {
  stat: CompareStat;
  /** Your average per game. */
  yours: number;
  /** The rank's average for games of the same lengths as yours. */
  theirs: number;
  /** (yours − theirs) / theirs, as a percentage. */
  diffPct: number;
  /** Whether the difference is in your favour (fewer deaths counts as better). */
  better: boolean;
}

export interface HeroCompare {
  heroId: number;
  games: number;
  stats: StatGap[];
}

export interface CompareResult {
  heroes: HeroCompare[];
  /** Your biggest shortfall and your biggest edge (over the heroes compared). */
  weakest: { heroId: number; stat: StatGap } | null;
  strongest: { heroId: number; stat: StatGap } | null;
}

function yoursOf(g: CompareGame, stat: CompareStat): number | null {
  switch (stat) {
    case "lastHits":
      return g.lastHits;
    case "fights":
      return g.kills + g.assists;
    case "deaths":
      return g.deaths;
  }
}

/**
 * What players at the rank had by `minutes` of game time: the curve's point at that minute;
 * past the curve's last minute, its last point scaled by the extra time (a straight-line
 * guess for long games, which only lengthens what they'd have by then).
 */
export function theirsAt(
  curve: readonly CurvePoint[],
  minutes: number,
  stat: CompareStat,
): number | null {
  if (curve.length === 0) return null;
  const last = curve[curve.length - 1];
  if (minutes >= last.minute) return last.minute > 0 ? (last[stat] * minutes) / last.minute : null;
  const m = Math.max(0, Math.round(minutes));
  const exact = curve.find((p) => p.minute === m) ?? curve.find((p) => p.minute > m);
  return exact ? exact[stat] : null;
}

/** Your heroes against players at a rank; `curves` per hero id (missing: skipped). */
export function compareToRank(
  games: readonly CompareGame[],
  curves: ReadonlyMap<number, readonly CurvePoint[]>,
  limit = MAX_COMPARE_HEROES,
): CompareResult {
  const byHero = new Map<number, CompareGame[]>();
  for (const g of games) {
    if (g.durationSec < MIN_DURATION_SEC) continue;
    byHero.set(g.heroId, [...(byHero.get(g.heroId) ?? []), g]);
  }
  const heroes: HeroCompare[] = [];
  const ranked = [...byHero]
    .filter(([, gs]) => gs.length >= MIN_COMPARE_GAMES)
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
    .slice(0, limit);
  for (const [heroId, gs] of ranked) {
    const curve = curves.get(heroId);
    if (!curve || curve.length === 0) continue;
    const stats: StatGap[] = [];
    for (const stat of COMPARE_STATS) {
      let yours = 0;
      let theirs = 0;
      let n = 0;
      for (const g of gs) {
        const y = yoursOf(g, stat);
        const t = theirsAt(curve, g.durationSec / 60, stat);
        if (y === null || t === null) continue;
        yours += y;
        theirs += t;
        n++;
      }
      if (n < MIN_COMPARE_GAMES || theirs <= 0) continue;
      const diffPct = Math.round(((yours - theirs) / theirs) * 100);
      stats.push({
        stat,
        yours: yours / n,
        theirs: theirs / n,
        diffPct,
        better: LOWER_IS_BETTER.has(stat) ? diffPct <= 0 : diffPct >= 0,
      });
    }
    if (stats.length) heroes.push({ heroId, games: gs.length, stats });
  }
  // How far each gap is in the bad (or good) direction, whatever the stat.
  const signed = (s: StatGap) => (LOWER_IS_BETTER.has(s.stat) ? -s.diffPct : s.diffPct);
  const all = heroes.flatMap((h) =>
    h.stats.map((stat) => ({ heroId: h.heroId, stat, games: h.games })),
  );
  const weakest = [...all].sort((a, b) => signed(a.stat) - signed(b.stat) || b.games - a.games)[0];
  const strongest = [...all].sort(
    (a, b) => signed(b.stat) - signed(a.stat) || b.games - a.games,
  )[0];
  return {
    heroes,
    weakest:
      weakest && signed(weakest.stat) < 0 ? { heroId: weakest.heroId, stat: weakest.stat } : null,
    strongest:
      strongest && signed(strongest.stat) > 0
        ? { heroId: strongest.heroId, stat: strongest.stat }
        : null,
  };
}
