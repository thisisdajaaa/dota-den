export const PERIODS = ["week", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

/**
 * Start of the period, or null for all time. A week starts Monday 00:00 UTC, the same moment
 * for everyone, so a weekly board means the same thing in every time zone.
 */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === "all") return null;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}
