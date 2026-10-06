import { addDays, type DayKey } from "@/common/time/day-key";

/**
 * MMR calendar (spec §2.1). Rules, in order of trust:
 * 1. Actual: a day's change is exact only when two of the user's own entries bracket it
 *    and every ranked match between them was played on that day. Intervals with no games
 *    attribute nothing (a correction or unimported games can't be placed on a day).
 * 2. Interval: otherwise the net change between entries is known only for the whole span.
 * 3. Estimate: a clearly labelled win/loss estimate (±ESTIMATE_PER_GAME per ranked game).
 * Nothing here ever turns an estimate into an actual value.
 */
export const ESTIMATE_PER_GAME = 25;

export interface Observation {
  observedAt: Date;
  mmr: number;
}

export interface RankedResult {
  startedAt: Date;
  result: "win" | "loss";
  queueClass: "solo" | "party" | "unknown";
}

export type QueueScope = "all" | "solo" | "party";

export interface CalendarDay {
  key: DayKey;
  games: number;
  wins: number;
  losses: number;
  /** Exact change from the user's entries, or null when it can't be pinned to this day. */
  actualDelta: number | null;
  /** Win/loss-based estimate. Always labelled as an estimate in the UI. */
  estimatedDelta: number;
  /** Entries logged on this day (latest last). */
  observations: Observation[];
}

export interface Interval {
  from: Observation;
  to: Observation;
  fromDay: DayKey;
  toDay: DayKey;
  delta: number;
  games: number;
  /** True when every game in the interval was played on one day (then it's that day's actual delta). */
  singleDay: boolean;
  /** That day, when `singleDay`. */
  gameDay: DayKey | null;
}

export interface CalendarPeriodSummary {
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** Net change from entries at/before the period start and at/before its end; null if unknown. */
  actualNet: number | null;
  estimatedNet: number;
  currentMmr: Observation | null;
  best: CalendarDay | null;
  worst: CalendarDay | null;
}

export interface Calendar {
  days: Map<DayKey, CalendarDay>;
  intervals: Interval[];
  summary: CalendarPeriodSummary;
}

function inScope(r: RankedResult, scope: QueueScope): boolean {
  return scope === "all" || r.queueClass === scope;
}

/** Signed value used to rank days: actual when known, else estimate. */
export function dayValue(d: CalendarDay): number {
  return d.actualDelta ?? d.estimatedDelta;
}

export function buildCalendar(input: {
  observations: readonly Observation[];
  matches: readonly RankedResult[];
  period: { from: DayKey; to: DayKey };
  dayKey: (d: Date) => DayKey;
  scope: QueueScope;
  /**
   * Ranked games are known for this range only (default: all of them). Spans between entries
   * that reach outside it are never exact, since games we didn't load may fall inside them.
   */
  loaded?: { from: Date; to: Date };
}): Calendar {
  const { period, dayKey, scope } = input;
  const covered = (from: Date, to: Date) =>
    !input.loaded || (from >= input.loaded.from && to <= input.loaded.to);
  const obs = [...input.observations].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const matches = [...input.matches].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const days = new Map<DayKey, CalendarDay>();
  const day = (key: DayKey): CalendarDay => {
    let d = days.get(key);
    if (!d) {
      d = {
        key,
        games: 0,
        wins: 0,
        losses: 0,
        actualDelta: null,
        estimatedDelta: 0,
        observations: [],
      };
      days.set(key, d);
    }
    return d;
  };
  const inPeriod = (key: DayKey) => key >= period.from && key <= period.to;

  for (const m of matches) {
    if (!inScope(m, scope)) continue;
    const key = dayKey(m.startedAt);
    if (!inPeriod(key)) continue;
    const d = day(key);
    d.games++;
    if (m.result === "win") d.wins++;
    else d.losses++;
    d.estimatedDelta += m.result === "win" ? ESTIMATE_PER_GAME : -ESTIMATE_PER_GAME;
  }

  for (const o of obs) {
    const key = dayKey(o.observedAt);
    if (inPeriod(key)) day(key).observations.push(o);
  }

  // Intervals between consecutive entries. Actual MMR moves with every ranked game regardless
  // of queue, so interval attribution always uses all ranked matches, not the scope filter.
  const intervals: Interval[] = [];
  for (let i = 1; i < obs.length; i++) {
    const from = obs[i - 1];
    const to = obs[i];
    const between = matches.filter(
      (m) => m.startedAt > from.observedAt && m.startedAt <= to.observedAt,
    );
    const matchDays = new Set(between.map((m) => dayKey(m.startedAt)));
    const toDay = dayKey(to.observedAt);
    // Exact attribution needs every game in the interval to fall on one local day; the change
    // belongs to that day even if the entries were logged on others (e.g. next morning).
    const gameDay = matchDays.size === 1 ? [...matchDays][0] : null;
    const interval: Interval = {
      from,
      to,
      fromDay: dayKey(from.observedAt),
      toDay,
      delta: to.mmr - from.mmr,
      games: between.length,
      singleDay: gameDay !== null,
      gameDay,
    };
    intervals.push(interval);
    // Only attribute an actual daily delta when the scope can't distort it: with a queue
    // filter, an exact figure would silently include games outside the scope.
    const scopeSafe = scope === "all" || between.every((m) => inScope(m, scope));
    if (gameDay && scopeSafe && inPeriod(gameDay) && covered(from.observedAt, to.observedAt)) {
      const d = day(gameDay);
      d.actualDelta = (d.actualDelta ?? 0) + interval.delta;
    }
  }

  const inRange = [...days.values()].filter((d) => d.games > 0 || d.actualDelta !== null);
  const wins = inRange.reduce((a, d) => a + d.wins, 0);
  const losses = inRange.reduce((a, d) => a + d.losses, 0);
  const ranked = [...inRange]
    .filter((d) => d.games > 0 || d.actualDelta !== null)
    .sort((a, b) => dayValue(b) - dayValue(a));

  const lastAtOrBefore = (key: DayKey) =>
    [...obs].reverse().find((o) => dayKey(o.observedAt) <= key) ?? null;
  const startObs = lastAtOrBefore(addDays(period.from, -1));
  const endObs = lastAtOrBefore(period.to);
  // Net over the period is exact only for the overall scope, with an entry before it and one
  // after its last game: no ranked game between the first entry and the period (it would be
  // counted in), and none in the period after the last entry (it would be left out).
  const exactNet =
    scope === "all" &&
    startObs !== null &&
    endObs !== null &&
    covered(startObs.observedAt, endObs.observedAt) &&
    !matches.some((m) => {
      const key = dayKey(m.startedAt);
      return (
        (m.startedAt > startObs.observedAt && key < period.from) ||
        (inPeriod(key) && m.startedAt > endObs.observedAt)
      );
    });
  const actualNet = exactNet ? endObs!.mmr - startObs!.mmr : null;

  return {
    days,
    intervals,
    summary: {
      games: wins + losses,
      wins,
      losses,
      winRate: wins + losses === 0 ? null : wins / (wins + losses),
      actualNet,
      estimatedNet: (wins - losses) * ESTIMATE_PER_GAME,
      currentMmr: obs.at(-1) ?? null,
      best: ranked.length && dayValue(ranked[0]) > 0 ? ranked[0] : null,
      worst: ranked.length && dayValue(ranked.at(-1)!) < 0 ? ranked.at(-1)! : null,
    },
  };
}
