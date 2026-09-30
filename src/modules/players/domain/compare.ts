/**
 * Comparing two players (pure), from public upstream data only.
 */
import type { HeroUsage, Peer, WinLoss } from "./public-player";

/** Games on a hero (each side) before it counts as a shared hero. */
export const MIN_SHARED_HERO_GAMES = 3;

export interface Tally {
  games: number;
  wins: number;
}

export interface PlayerSummary {
  record: Tally | null;
  /** The recent matches we loaded (up to 20). */
  recent: Tally;
  /** (kills + assists) / deaths over the recent matches; null without any. */
  kda: number | null;
  topHero: HeroUsage | null;
}

export function playerSummary(input: {
  record: WinLoss | null;
  heroes: readonly HeroUsage[] | null;
  matches:
    readonly { result: "win" | "loss"; kills: number; deaths: number; assists: number }[] | null;
}): PlayerSummary {
  const matches = input.matches ?? [];
  const k = matches.reduce((a, m) => a + m.kills + m.assists, 0);
  const d = matches.reduce((a, m) => a + m.deaths, 0);
  const top =
    [...(input.heroes ?? [])].filter((h) => h.games > 0).sort((a, b) => b.games - a.games)[0] ??
    null;
  return {
    record: input.record
      ? { games: input.record.wins + input.record.losses, wins: input.record.wins }
      : null,
    recent: { games: matches.length, wins: matches.filter((m) => m.result === "win").length },
    kda: matches.length ? k / Math.max(1, d) : null,
    topHero: top,
  };
}

export interface SharedHero {
  heroId: number;
  a: Tally;
  b: Tally;
}

/** Heroes both have played at least MIN_SHARED_HERO_GAMES times, most played (together) first. */
export function sharedHeroes(
  a: readonly HeroUsage[],
  b: readonly HeroUsage[],
  limit = 8,
): SharedHero[] {
  const byId = new Map(b.map((h) => [h.heroId, h]));
  return a
    .filter((h) => h.games >= MIN_SHARED_HERO_GAMES)
    .flatMap((h) => {
      const other = byId.get(h.heroId);
      return other && other.games >= MIN_SHARED_HERO_GAMES
        ? [
            {
              heroId: h.heroId,
              a: { games: h.games, wins: h.wins },
              b: { games: other.games, wins: other.wins },
            },
          ]
        : [];
    })
    .sort((x, y) => y.a.games + y.b.games - (x.a.games + x.b.games))
    .slice(0, limit);
}

export interface HeadToHead {
  /** Same team: games and wins. */
  together: Tally;
  /** Opposite teams: games, and how many the first player won. */
  against: Tally;
}

/** From the first player's peers: their record with and against the second. */
export function headToHead(aPeers: readonly Peer[], bAccountId32: number): HeadToHead | null {
  const p = aPeers.find((x) => x.accountId32 === bAccountId32);
  if (!p || p.withGames + p.againstGames === 0) return null;
  return {
    together: { games: p.withGames, wins: p.withWins },
    against: { games: p.againstGames, wins: p.againstWins },
  };
}
