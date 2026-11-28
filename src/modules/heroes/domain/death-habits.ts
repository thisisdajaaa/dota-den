/**
 * Your deaths (pure): when in the game you die and which heroes kill you, from the kill logs of
 * your stored parsed games. Only hero kills have a time; deaths to creeps, towers, neutrals or
 * Roshan are counted, never placed on the clock.
 */

/** How you died in one game, as stored with match extras (declared here: heroes don't import matches). */
export interface HeroDeaths {
  durationSec: number;
  byHeroes: ReadonlyArray<{ time: number; killerHeroId: number }>;
  other: number;
}

export interface DeathGame {
  heroId: number;
  result: "win" | "loss";
  deaths: HeroDeaths;
}

/** The laning stage, for "deaths before 10:00". */
export const DEATH_LANING_UNTIL_SEC = 600;
/** Medians and the wins/losses split need this many games. */
export const MIN_DEATH_GAMES = 5;
/** Killers listed, most kills on you first. */
export const TOP_KILLERS = 5;
/** Latest parsed games read (the same window as Your wards). */
export const DEATH_GAMES_LIMIT = 50;

export type DeathPhase = "laning" | "early" | "mid" | "late";
/** Game phases by clock time (seconds); the last one runs to the end of the game. */
export const DEATH_PHASES: ReadonlyArray<{ phase: DeathPhase; from: number; to: number }> = [
  { phase: "laning", from: 0, to: 600 },
  { phase: "early", from: 600, to: 1200 },
  { phase: "mid", from: 1200, to: 1800 },
  { phase: "late", from: 1800, to: Infinity },
];

export interface DeathHabits {
  games: number;
  /** All deaths per game (hero kills and the rest); null without games. */
  perGame: number | null;
  /** Share of deaths that were to an enemy hero; null without deaths. */
  heroShare: number | null;
  /** Hero kills on you before 10:00, per game. */
  laningPerGame: number | null;
  /** Typical time of your first death to a hero, in games with one; null below MIN_DEATH_GAMES. */
  firstDeathSec: number | null;
  /** Games where no hero killed you before 10:00, as a share; null below MIN_DEATH_GAMES. */
  cleanLaningShare: number | null;
  /**
   * Hero kills on you per 10 minutes played in each phase (only time actually played counts, so
   * short games don't thin out the late game). null where no game reached the phase.
   */
  byPhase: Array<{ phase: DeathPhase; deaths: number; per10: number | null }>;
  /** Deaths per game in wins and in losses; null below MIN_DEATH_GAMES each. */
  wins: { games: number; perGame: number | null };
  losses: { games: number; perGame: number | null };
  /** Heroes with the most kills on you: kills and games they killed you in. */
  killers: Array<{ heroId: number; kills: number; games: number }>;
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const total = (g: DeathGame) => g.deaths.byHeroes.length + g.deaths.other;

export function deathHabits(games: readonly DeathGame[]): DeathHabits {
  const n = games.length;
  const per = (x: number, d = n) => (d > 0 ? x / d : null);
  const all = games.reduce((s, g) => s + total(g), 0);
  const heroKills = games.reduce((s, g) => s + g.deaths.byHeroes.length, 0);
  const early = games.reduce(
    (s, g) => s + g.deaths.byHeroes.filter((d) => d.time < DEATH_LANING_UNTIL_SEC).length,
    0,
  );
  const firsts = games.flatMap((g) => (g.deaths.byHeroes[0] ? [g.deaths.byHeroes[0].time] : []));
  const clean = games.filter((g) =>
    g.deaths.byHeroes.every((d) => d.time >= DEATH_LANING_UNTIL_SEC),
  ).length;

  const byPhase = DEATH_PHASES.map(({ phase, from, to }) => {
    const deaths = games.reduce(
      (s, g) => s + g.deaths.byHeroes.filter((d) => d.time >= from && d.time < to).length,
      0,
    );
    const played = games.reduce(
      (s, g) => s + Math.max(0, Math.min(g.deaths.durationSec, to) - from),
      0,
    );
    // Under a minute played in a phase says nothing about it.
    return { phase, deaths, per10: played >= 60 ? (deaths * 600) / played : null };
  });

  const split = (result: DeathGame["result"]) => {
    const gs = games.filter((g) => g.result === result);
    return {
      games: gs.length,
      perGame:
        gs.length >= MIN_DEATH_GAMES ? gs.reduce((s, g) => s + total(g), 0) / gs.length : null,
    };
  };

  const byKiller = new Map<number, { kills: number; games: Set<number> }>();
  games.forEach((g, i) => {
    for (const d of g.deaths.byHeroes) {
      const k = byKiller.get(d.killerHeroId) ?? { kills: 0, games: new Set<number>() };
      k.kills++;
      k.games.add(i);
      byKiller.set(d.killerHeroId, k);
    }
  });
  const killers = [...byKiller]
    .map(([heroId, k]) => ({ heroId, kills: k.kills, games: k.games.size }))
    .sort((a, b) => b.kills - a.kills || b.games - a.games || a.heroId - b.heroId)
    .slice(0, TOP_KILLERS);

  return {
    games: n,
    perGame: per(all),
    heroShare: all > 0 ? heroKills / all : null,
    laningPerGame: per(early),
    firstDeathSec: n >= MIN_DEATH_GAMES ? median(firsts) : null,
    cleanLaningShare: n >= MIN_DEATH_GAMES ? clean / n : null,
    byPhase,
    wins: split("win"),
    losses: split("loss"),
    killers,
  };
}
