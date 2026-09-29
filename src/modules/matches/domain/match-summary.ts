import type { MatchResult } from "./player-match-fact";
import type { QueueClass } from "./queue-classification";

/** Below this many games a win rate is shown but flagged as a low sample. */
export const MIN_SAMPLE = 10;

export interface SummaryInput {
  matchId: string;
  startedAt: Date;
  heroId: number;
  result: MatchResult;
  kills: number;
  deaths: number;
  assists: number;
  queueClass: QueueClass;
  partySize: number | null;
}

export interface WinRecord {
  games: number;
  wins: number;
  losses: number;
  /** null when there are no games; never a fabricated 0%. */
  winRate: number | null;
  lowSample: boolean;
}

export interface HeroSummary extends WinRecord {
  heroId: number;
  kda: number;
  lastPlayed: Date;
}

export interface MatchSummary {
  overall: WinRecord;
  byQueue: Record<QueueClass, WinRecord>;
  /** Party games split by reported party size (2–5). */
  byPartySize: Array<{ partySize: number } & WinRecord>;
  averages: { kills: number; deaths: number; assists: number; kda: number } | null;
  /** Most recent first. */
  form: Array<Pick<SummaryInput, "matchId" | "result" | "heroId" | "startedAt">>;
  heroes: HeroSummary[];
  distinctHeroes: number;
}

export function winRecord(results: readonly MatchResult[]): WinRecord {
  const wins = results.filter((r) => r === "win").length;
  const games = results.length;
  return {
    games,
    wins,
    losses: games - wins,
    winRate: games === 0 ? null : wins / games,
    lowSample: games < MIN_SAMPLE,
  };
}

export function kdaRatio(k: number, d: number, a: number): number {
  return (k + a) / Math.max(1, d);
}

export function summarizeMatches(
  input: readonly SummaryInput[],
  opts: { formLength?: number; topHeroes?: number } = {},
): MatchSummary {
  const matches = [...input].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const results = (xs: readonly SummaryInput[]) => xs.map((m) => m.result);
  const byClass = (c: QueueClass) => matches.filter((m) => m.queueClass === c);

  const byPartySize = [2, 3, 4, 5]
    .map((size) => ({
      partySize: size,
      ...winRecord(
        results(matches.filter((m) => m.queueClass === "party" && m.partySize === size)),
      ),
    }))
    .filter((r) => r.games > 0);

  const heroGroups = new Map<number, SummaryInput[]>();
  for (const m of matches) heroGroups.set(m.heroId, [...(heroGroups.get(m.heroId) ?? []), m]);
  const heroes = [...heroGroups.entries()]
    .map(([heroId, games]) => ({
      heroId,
      ...winRecord(results(games)),
      kda: kdaRatio(sum(games, "kills"), sum(games, "deaths"), sum(games, "assists")),
      // Matches are sorted newest first, so the first one is the most recent.
      lastPlayed: games[0].startedAt,
    }))
    .sort((a, b) => b.games - a.games || (b.winRate ?? 0) - (a.winRate ?? 0))
    .slice(0, opts.topHeroes ?? 6);

  const n = matches.length;
  return {
    overall: winRecord(results(matches)),
    byQueue: {
      solo: winRecord(results(byClass("solo"))),
      party: winRecord(results(byClass("party"))),
      unknown: winRecord(results(byClass("unknown"))),
    },
    byPartySize,
    averages:
      n === 0
        ? null
        : {
            kills: sum(matches, "kills") / n,
            deaths: sum(matches, "deaths") / n,
            assists: sum(matches, "assists") / n,
            kda: kdaRatio(sum(matches, "kills"), sum(matches, "deaths"), sum(matches, "assists")),
          },
    form: matches.slice(0, opts.formLength ?? 20).map(({ matchId, result, heroId, startedAt }) => ({
      matchId,
      result,
      heroId,
      startedAt,
    })),
    heroes,
    distinctHeroes: heroGroups.size,
  };
}

function sum(xs: readonly SummaryInput[], key: "kills" | "deaths" | "assists"): number {
  return xs.reduce((acc, m) => acc + m[key], 0);
}

export type HeroSort = "games" | "winrate" | "kda" | "recent";

/**
 * Win rate and KDA from a handful of games are noise, so those sorts need as many games as
 * the rest of the app treats as enough to judge.
 */
export const HERO_SORT_MIN_GAMES = MIN_SAMPLE;

/**
 * Order a hero pool. "winrate" and "kda" leave out heroes with fewer than
 * HERO_SORT_MIN_GAMES games (a 1-0 hero would otherwise top the list at 100%).
 * Ties break by games played, then hero id, so the order is stable.
 */
export function sortHeroes(heroes: readonly HeroSummary[], by: HeroSort): HeroSummary[] {
  const pool =
    by === "winrate" || by === "kda"
      ? heroes.filter((h) => h.games >= HERO_SORT_MIN_GAMES)
      : [...heroes];
  const key = (h: HeroSummary): number =>
    by === "games"
      ? h.games
      : by === "winrate"
        ? (h.winRate ?? 0)
        : by === "kda"
          ? h.kda
          : h.lastPlayed.getTime();
  return pool.sort((a, b) => key(b) - key(a) || b.games - a.games || a.heroId - b.heroId);
}
