/**
 * Public player data as the upstream reports it (OpenDota), after validation. Nothing here
 * comes from our database: other players' profiles only ever show public upstream data.
 */
export interface PlayerSearchHit {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
  lastMatchAt: Date | null;
}

export interface WinLoss {
  wins: number;
  losses: number;
}

export interface HeroUsage {
  heroId: number;
  games: number;
  wins: number;
  lastPlayedAt: Date | null;
}

/** Someone who shared matches with the player. `with*` = same team, `against*` = other team. */
export interface Peer {
  accountId32: number;
  personaName: string | null;
  avatarUrl: string | null;
  withGames: number;
  withWins: number;
  againstGames: number;
  againstWins: number;
  lastPlayedAt: Date | null;
}

export function winRate(wins: number, games: number): number | null {
  return games > 0 ? wins / games : null;
}

export function totalGames(wl: WinLoss): number {
  return wl.wins + wl.losses;
}

/** Most frequent teammates first (ties: most recent), dropping people only ever played against. */
export function topTeammates(peers: readonly Peer[], limit = 10): Peer[] {
  return peers
    .filter((p) => p.withGames > 0)
    .sort(
      (a, b) =>
        b.withGames - a.withGames ||
        (b.lastPlayedAt?.getTime() ?? 0) - (a.lastPlayedAt?.getTime() ?? 0),
    )
    .slice(0, limit);
}

/** Most played heroes first, only heroes with at least one game. */
export function topHeroes(heroes: readonly HeroUsage[], limit = 8): HeroUsage[] {
  return heroes
    .filter((h) => h.games > 0)
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, limit);
}
