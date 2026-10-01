import { buildCalendar, type Observation } from "./calendar";
import { addDays, type DayKey } from "./day-key";

/** A ranked game, as the recap needs it. */
export interface RecapGame {
  startedAt: Date;
  heroId: number;
  result: "win" | "loss";
  queueClass: "solo" | "party" | "unknown";
}

export interface WeekRecord {
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

export interface HeroWeek {
  heroId: number;
  games: number;
  wins: number;
}

export interface WeeklyRecap {
  from: DayKey;
  to: DayKey;
  thisWeek: WeekRecord;
  lastWeek: WeekRecord;
  /** Exact only when your entries bracket the week's games (same rule as the calendar). */
  mmr: { exact: number | null; estimate: number };
  mostPlayed: HeroWeek | null;
  /** Best win rate with at least BEST_MIN_GAMES games. */
  best: HeroWeek | null;
}

export const BEST_MIN_GAMES = 3;

function record(games: readonly RecapGame[]): WeekRecord {
  const wins = games.filter((g) => g.result === "win").length;
  return {
    games: games.length,
    wins,
    losses: games.length - wins,
    winRate: games.length ? wins / games.length : null,
  };
}

/**
 * This week (as the MMR journal's week view counts it, in the player's time zone) against
 * last week: ranked record, MMR change and heroes. `games` should cover both weeks and out to
 * the entries either side.
 */
export function weeklyRecap(input: {
  games: readonly RecapGame[];
  observations: readonly Observation[];
  week: { from: DayKey; to: DayKey };
  dayKey: (d: Date) => DayKey;
  loaded: { from: Date; to: Date };
}): WeeklyRecap {
  const { week, dayKey } = input;
  const inRange = (from: DayKey, to: DayKey) => (g: RecapGame) => {
    const k = dayKey(g.startedAt);
    return k >= from && k <= to;
  };
  const thisWeek = input.games.filter(inRange(week.from, week.to));
  const lastWeek = input.games.filter(inRange(addDays(week.from, -7), addDays(week.to, -7)));

  const calendar = buildCalendar({
    observations: input.observations,
    matches: input.games,
    period: week,
    dayKey,
    scope: "all",
    loaded: input.loaded,
  });

  const byHero = new Map<number, HeroWeek>();
  for (const g of thisWeek) {
    const h = byHero.get(g.heroId) ?? { heroId: g.heroId, games: 0, wins: 0 };
    h.games++;
    if (g.result === "win") h.wins++;
    byHero.set(g.heroId, h);
  }
  const heroes = [...byHero.values()];
  const mostPlayed =
    [...heroes].sort((a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId)[0] ??
    null;
  const best =
    heroes
      .filter((h) => h.games >= BEST_MIN_GAMES)
      .sort(
        (a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games || a.heroId - b.heroId,
      )[0] ?? null;

  return {
    from: week.from,
    to: week.to,
    thisWeek: record(thisWeek),
    lastWeek: record(lastWeek),
    mmr: { exact: calendar.summary.actualNet, estimate: calendar.summary.estimatedNet },
    mostPlayed,
    best,
  };
}
