/**
 * Who you lose to: matchups from your own imported games (both lineups stored per game).
 * Pure: every number is counted from your games. Games without lineups are counted apart and
 * never filled in; heroes met in fewer than `minGames` games are counted, not listed.
 */
import { MIN_MATCHUP_GAMES, type GameResult } from "./hero-stats";

/** Pull toward 50% when ranking, so 5-0 doesn't outrank 40-10 (same strength as elsewhere). */
export const OWN_MATCHUP_PRIOR = 10;
/** Rows per list. */
export const OWN_MATCHUP_LIMIT = 8;
/** Your heroes listed under each opponent ("what you played into them"). */
export const PLAYED_INTO_LIMIT = 3;

/** One of your games, with both lineups (null: the upstream had none for it). */
export interface LineupGame {
  heroId: number;
  result: GameResult;
  allyHeroIds: readonly number[] | null;
  enemyHeroIds: readonly number[] | null;
}

export interface HeroTally {
  heroId: number;
  games: number;
  wins: number;
  losses: number;
}

export interface MatchupRecord extends HeroTally {
  winRate: number;
  /** Win rate pulled toward 50% by OWN_MATCHUP_PRIOR games: for ranking only, never shown. */
  rankRate: number;
  /** Your heroes in those games, most played first (enemies only; empty for allies). */
  playedInto: HeroTally[];
}

export interface OwnMatchups {
  /** Games in the filter, with or without lineups. */
  games: number;
  /** Of those, games with lineups: the matchups' sample. */
  withLineups: number;
  /** Your record over the games with lineups (the reference for every row); null with none. */
  baseline: { games: number; wins: number; winRate: number } | null;
  /** Enemy heroes you lose to (under 50%), worst first. */
  toughest: MatchupRecord[];
  /** Enemy heroes you beat (50% or better), best first. */
  easiest: MatchupRecord[];
  /** Allied heroes you win with (50% or better), best first. */
  bestAllies: MatchupRecord[];
  /** Allied heroes you lose with (under 50%), worst first. */
  worstAllies: MatchupRecord[];
  /** Heroes met, but in fewer than `minGames` games: counted, not listed. */
  enemiesBelowMin: number;
  alliesBelowMin: number;
  minGames: number;
}

interface Tally {
  games: number;
  wins: number;
  /** Your hero → your games and wins on it (enemies only). */
  yours: Map<number, { games: number; wins: number }>;
}

function add(map: Map<number, Tally>, heroId: number, game: LineupGame, trackYours: boolean) {
  const t = map.get(heroId) ?? { games: 0, wins: 0, yours: new Map() };
  const won = game.result === "win" ? 1 : 0;
  t.games++;
  t.wins += won;
  if (trackYours) {
    const y = t.yours.get(game.heroId) ?? { games: 0, wins: 0 };
    y.games++;
    y.wins += won;
    t.yours.set(game.heroId, y);
  }
  map.set(heroId, t);
}

function toRecord(heroId: number, t: Tally, prior: number, playedIntoLimit: number) {
  return {
    heroId,
    games: t.games,
    wins: t.wins,
    losses: t.games - t.wins,
    winRate: t.wins / t.games,
    rankRate: (t.wins + prior * 0.5) / (t.games + prior),
    playedInto: [...t.yours.entries()]
      .map(([id, y]) => ({ heroId: id, games: y.games, wins: y.wins, losses: y.games - y.wins }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId)
      .slice(0, playedIntoLimit),
  } satisfies MatchupRecord;
}

const best = (a: MatchupRecord, b: MatchupRecord) =>
  b.rankRate - a.rankRate || b.games - a.games || a.heroId - b.heroId;
const worst = (a: MatchupRecord, b: MatchupRecord) =>
  a.rankRate - b.rankRate || b.games - a.games || a.heroId - b.heroId;

/**
 * Your record against and with every hero, from games with both lineups. A hero is listed
 * once it reaches `minGames`; lists are split at 50% (so no hero is both "toughest" and
 * "easiest") and ranked by the damped rate, ties by more games, then hero id.
 */
export function ownMatchups(
  games: readonly LineupGame[],
  opts: { minGames?: number; limit?: number; prior?: number; playedIntoLimit?: number } = {},
): OwnMatchups {
  const minGames = opts.minGames ?? MIN_MATCHUP_GAMES;
  const limit = opts.limit ?? OWN_MATCHUP_LIMIT;
  const prior = opts.prior ?? OWN_MATCHUP_PRIOR;
  const intoLimit = opts.playedIntoLimit ?? PLAYED_INTO_LIMIT;

  const enemies = new Map<number, Tally>();
  const allies = new Map<number, Tally>();
  let withLineups = 0;
  let wins = 0;
  for (const g of games) {
    // A game counts once its enemy lineup is known; unknown lineups are never guessed.
    if (g.enemyHeroIds === null || g.enemyHeroIds.length === 0) continue;
    withLineups++;
    if (g.result === "win") wins++;
    for (const id of new Set(g.enemyHeroIds)) add(enemies, id, g, true);
    for (const id of new Set(g.allyHeroIds ?? [])) if (id !== g.heroId) add(allies, id, g, false);
  }

  const listed = (map: Map<number, Tally>) =>
    [...map.entries()]
      .filter(([, t]) => t.games >= minGames)
      .map(([id, t]) => toRecord(id, t, prior, intoLimit));
  const enemyRows = listed(enemies);
  const allyRows = listed(allies);
  const top = (rows: MatchupRecord[], winning: boolean, order: typeof best) =>
    rows
      .filter((r) => (winning ? r.winRate >= 0.5 : r.winRate < 0.5))
      .sort(order)
      .slice(0, limit);

  return {
    games: games.length,
    withLineups,
    baseline: withLineups === 0 ? null : { games: withLineups, wins, winRate: wins / withLineups },
    toughest: top(enemyRows, false, worst),
    easiest: top(enemyRows, true, best),
    bestAllies: top(allyRows, true, best),
    worstAllies: top(allyRows, false, worst),
    enemiesBelowMin: enemies.size - enemyRows.length,
    alliesBelowMin: allies.size - allyRows.length,
    minGames,
  };
}

/** Progress of the lineup backfill, as shown: "matchups for 120 of 940 games so far". */
export interface LineupProgress {
  total: number;
  withLineups: number;
  /** Still being re-read; false once done (games left over have no lineup upstream). */
  inProgress: boolean;
  /** Games that will never have lineups (the upstream had none); 0 while in progress. */
  missing: number;
}

export function lineupProgress(coverage: {
  total: number;
  withLineups: number;
  complete: boolean;
}): LineupProgress {
  const withLineups = Math.min(coverage.withLineups, coverage.total);
  return {
    total: coverage.total,
    withLineups,
    inProgress: !coverage.complete,
    missing: coverage.complete ? coverage.total - withLineups : 0,
  };
}
