/**
 * Your year in Dota (pure): one calendar year of your imported games, in your time zone.
 * Every number is counted from the games themselves: nothing is estimated, no MMR is involved,
 * and a game whose party size is unknown is never counted as solo.
 */
import type { DayKey } from "@/common/time/day-key";
import { weekday } from "@/common/time/day-key";
import { localHour } from "@/common/time/local-hour";

export interface YearGame {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  ranked: boolean;
  queueClass: "solo" | "party" | "unknown";
}

export interface WinRecord {
  games: number;
  wins: number;
}

export interface YearHero extends WinRecord {
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface YearStreak {
  games: number;
  from: Date;
  to: Date;
}

export interface YearBestGame {
  matchId: string;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  at: Date;
}

export interface YearReview {
  year: number;
  games: number;
  wins: number;
  /** Total game time, in seconds. */
  playedSec: number;
  ranked: WinRecord;
  /** Unknown party sizes stay unknown: they're neither solo nor party. */
  queue: { solo: WinRecord; party: WinRecord; unknown: number };
  heroesPlayed: number;
  /** Most played first (ties: more wins, then hero id), at most TOP_HEROES. */
  topHeroes: YearHero[];
  /** Best win rate with at least MIN_HERO_GAMES games; null when no hero has that many. */
  bestHero: YearHero | null;
  /** January first, always 12. */
  months: WinRecord[];
  /** Month index (0–11) with the most games. */
  busiestMonth: number | null;
  /** Month index with the best win rate, at least MIN_MONTH_GAMES games. */
  bestMonth: number | null;
  /** Sunday first, always 7. */
  weekdays: WinRecord[];
  /** Games by local starting hour, always 24. */
  hours: number[];
  /** The 3-hour window (start hour, wrapping past midnight) with the most game starts. */
  peakHours: { from: number; games: number } | null;
  /** The day with the most games. */
  biggestDay: (WinRecord & { day: DayKey }) | null;
  longestWinStreak: YearStreak | null;
  longestLossStreak: YearStreak | null;
  /** The win with the best kills + assists − deaths. */
  bestGame: YearBestGame | null;
  first: Date | null;
  last: Date | null;
}

export const TOP_HEROES = 5;
export const MIN_HERO_GAMES = 10;
export const MIN_MONTH_GAMES = 10;
/** A year page needs at least this many games to say anything. */
export const MIN_YEAR_GAMES = 5;

const rate = (r: WinRecord) => (r.games ? r.wins / r.games : 0);

/** The calendar year of a day key. */
export const yearOf = (k: DayKey) => Number(k.slice(0, 4));

export function yearReview(
  all: readonly YearGame[],
  opts: { year: number; timeZone: string; dayKey: (d: Date) => DayKey },
): YearReview {
  const games = all
    .filter((g) => yearOf(opts.dayKey(g.startedAt)) === opts.year)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const blank = (): WinRecord => ({ games: 0, wins: 0 });
  const add = (r: WinRecord, won: boolean) => {
    r.games++;
    if (won) r.wins++;
  };
  const months = Array.from({ length: 12 }, blank);
  const weekdays = Array.from({ length: 7 }, blank);
  const hours = Array.from({ length: 24 }, () => 0);
  const ranked = blank();
  const queue = { solo: blank(), party: blank(), unknown: 0 };
  const heroes = new Map<number, YearHero>();
  const days = new Map<DayKey, WinRecord>();
  let wins = 0;
  let playedSec = 0;
  let bestGame: YearBestGame | null = null;
  let win: YearStreak | null = null;
  let loss: YearStreak | null = null;
  let bestWin: YearStreak | null = null;
  let bestLoss: YearStreak | null = null;

  for (const g of games) {
    if (g.won) wins++;
    playedSec += Math.max(0, g.durationSec);
    if (g.ranked) add(ranked, g.won);
    if (g.queueClass === "unknown") queue.unknown++;
    else add(queue[g.queueClass], g.won);

    const h = heroes.get(g.heroId) ?? {
      heroId: g.heroId,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };
    add(h, g.won);
    h.kills += g.kills;
    h.deaths += g.deaths;
    h.assists += g.assists;
    heroes.set(g.heroId, h);

    const day = opts.dayKey(g.startedAt);
    add(months[Number(day.slice(5, 7)) - 1]!, g.won);
    add(weekdays[weekday(day)]!, g.won);
    hours[localHour(g.startedAt, opts.timeZone)]!++;
    const d = days.get(day) ?? blank();
    add(d, g.won);
    days.set(day, d);

    if (g.won) {
      win = extend(win, g);
      loss = null;
      if (!bestWin || win.games > bestWin.games) bestWin = win;
      const score = g.kills + g.assists - g.deaths;
      if (!bestGame || score > bestGame.kills + bestGame.assists - bestGame.deaths)
        bestGame = {
          matchId: g.matchId,
          heroId: g.heroId,
          kills: g.kills,
          deaths: g.deaths,
          assists: g.assists,
          at: g.startedAt,
        };
    } else {
      loss = extend(loss, g);
      win = null;
      if (!bestLoss || loss.games > bestLoss.games) bestLoss = loss;
    }
  }

  const ranking = [...heroes.values()].sort(
    (a, b) => b.games - a.games || b.wins - a.wins || a.heroId - b.heroId,
  );
  const bestHero =
    ranking
      .filter((h) => h.games >= MIN_HERO_GAMES)
      .sort((a, b) => rate(b) - rate(a) || b.games - a.games || a.heroId - b.heroId)[0] ?? null;

  let busiestMonth: number | null = null;
  let bestMonth: number | null = null;
  months.forEach((m, i) => {
    if (m.games > 0 && (busiestMonth === null || m.games > months[busiestMonth]!.games))
      busiestMonth = i;
    if (m.games >= MIN_MONTH_GAMES && (bestMonth === null || rate(m) > rate(months[bestMonth]!)))
      bestMonth = i;
  });

  let peakHours: YearReview["peakHours"] = null;
  for (let from = 0; from < 24; from++) {
    const n = hours[from]! + hours[(from + 1) % 24]! + hours[(from + 2) % 24]!;
    if (n > 0 && (!peakHours || n > peakHours.games)) peakHours = { from, games: n };
  }

  let biggestDay: YearReview["biggestDay"] = null;
  for (const [day, r] of [...days].sort(([a], [b]) => a.localeCompare(b)))
    if (!biggestDay || r.games > biggestDay.games) biggestDay = { day, ...r };

  return {
    year: opts.year,
    games: games.length,
    wins,
    playedSec,
    ranked,
    queue,
    heroesPlayed: heroes.size,
    topHeroes: ranking.slice(0, TOP_HEROES),
    bestHero,
    months,
    busiestMonth,
    bestMonth,
    weekdays,
    hours,
    peakHours,
    biggestDay,
    longestWinStreak: bestWin,
    longestLossStreak: bestLoss,
    bestGame,
    first: games[0]?.startedAt ?? null,
    last: games.at(-1)?.startedAt ?? null,
  };
}

/** The streak with this game added (a new one when there's none). */
function extend(s: YearStreak | null, g: YearGame): YearStreak {
  return s
    ? { games: s.games + 1, from: s.from, to: g.startedAt }
    : { games: 1, from: g.startedAt, to: g.startedAt };
}

/**
 * The years a player can open: from their first imported game's year to this year, newest
 * first. This year is listed even before its first game, so the page always has a default.
 */
export function reviewYears(firstGame: Date | null, today: DayKey, dayKey: (d: Date) => DayKey) {
  const now = yearOf(today);
  const start = firstGame ? Math.min(yearOf(dayKey(firstGame)), now) : now;
  return Array.from({ length: now - start + 1 }, (_, i) => now - i);
}

/** The year review is offered on the overview from December 1 to January 15. */
export const YEAR_PROMPT_LAST_JANUARY_DAY = 15;

/** The year the overview offers in review today: this one in December, last one in early January. */
export function yearPromptFor(today: DayKey): number | null {
  const year = yearOf(today);
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  if (month === 12) return year;
  if (month === 1 && day <= YEAR_PROMPT_LAST_JANUARY_DAY) return year - 1;
  return null;
}
