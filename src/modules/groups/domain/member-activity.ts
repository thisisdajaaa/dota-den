/**
 * Who plays what and the weekly group board (pure). From members' imported public match
 * data only: heroes played and ranked wins and losses. Never MMR, real or estimated.
 */

/** "Recently" for who plays what. */
export const RECENT_HERO_DAYS = 30;
/** Heroes shown per member. */
export const TOP_HEROES = 3;
/** The weekly board covers this many days back from now. */
export const BOARD_DAYS = 7;

export interface HeroPlay {
  heroId: number;
  result: "win" | "loss";
}

export interface HeroCount {
  heroId: number;
  games: number;
  wins: number;
}

/** A member's most played heroes, most games first (ties: more wins, then hero id). */
export function topHeroes(games: readonly HeroPlay[], limit = TOP_HEROES): HeroCount[] {
  const by = new Map<number, HeroCount>();
  for (const g of games) {
    const h = by.get(g.heroId) ?? { heroId: g.heroId, games: 0, wins: 0 };
    h.games++;
    if (g.result === "win") h.wins++;
    by.set(g.heroId, h);
  }
  return [...by.values()]
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId)
    .slice(0, limit);
}

export interface BoardInput {
  accountId32: number;
  wins: number;
  losses: number;
}

export interface BoardRow extends BoardInput {
  games: number;
  winRate: number;
  rank: number;
}

/**
 * Members who played ranked this week, best first: most net wins, then win rate, then games.
 * Ties share a rank. Members with no ranked games are listed apart (idle), not ranked last.
 */
export function weeklyBoard(inputs: readonly BoardInput[]): { rows: BoardRow[]; idle: number[] } {
  const net = (r: BoardInput) => r.wins - r.losses;
  const sorted = inputs
    .filter((i) => i.wins + i.losses > 0)
    .map((i) => ({
      ...i,
      games: i.wins + i.losses,
      winRate: i.wins / (i.wins + i.losses),
      rank: 0,
    }))
    .sort(
      (a, b) =>
        net(b) - net(a) ||
        b.winRate - a.winRate ||
        b.games - a.games ||
        a.accountId32 - b.accountId32,
    );
  let rank = 0;
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || net(prev) !== net(r) || prev.winRate !== r.winRate) rank = i + 1;
    r.rank = rank;
  });
  return {
    rows: sorted,
    idle: inputs.filter((i) => i.wins + i.losses === 0).map((i) => i.accountId32),
  };
}
