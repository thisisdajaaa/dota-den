import { addDays, daysBetween, type DayKey } from "@/common/time/day-key";

export const REPORT_PERIODS = [30, 90, 180] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const DEFAULT_PERIOD: ReportPeriod = 90;
/** A custom range spans at most a year and starts at most two years back. */
export const MAX_RANGE_DAYS = 365;
export const MAX_LOOKBACK_DAYS = 730;

export interface ReportRange {
  from: DayKey;
  to: DayKey;
  /** Days in the range, both ends included. */
  length: number;
  /** The preset this is, or null for a custom range. */
  preset: ReportPeriod | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const valid = (k: unknown): k is DayKey =>
  typeof k === "string" && DAY.test(k) && addDays(k, 0) === k;

function preset(days: ReportPeriod, today: DayKey): ReportRange {
  return { from: addDays(today, -(days - 1)), to: today, length: days, preset: days };
}

/**
 * The report's range from the URL: `?from=YYYY-MM-DD&to=YYYY-MM-DD` for a custom range, else
 * `?days=30|90|180`. Anything invalid falls back to the default preset.
 */
export function parseReportRange(
  params: { days?: unknown; from?: unknown; to?: unknown },
  today: DayKey,
): ReportRange {
  const { from, to } = params;
  if (valid(from) && valid(to) && from <= to && to <= today) {
    const length = daysBetween(from, to).length;
    if (length <= MAX_RANGE_DAYS && from >= addDays(today, -MAX_LOOKBACK_DAYS))
      return { from, to, length, preset: null };
  }
  const days = Number(params.days);
  return preset(
    (REPORT_PERIODS as readonly number[]).includes(days) ? (days as ReportPeriod) : DEFAULT_PERIOD,
    today,
  );
}

/** The period of the same length just before. */
export function previousRange(r: ReportRange): { from: DayKey; to: DayKey } {
  return { from: addDays(r.from, -r.length), to: addDays(r.from, -1) };
}
