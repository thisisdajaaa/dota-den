import type { DayKey } from "@/common/time/day-key";

/** Wider than any UTC offset, so a local day is always inside the padded UTC range. */
export const TZ_PAD_MS = 15 * 3_600_000;

/**
 * The time range of ranked games to load for a period of local days: from the MMR entry
 * before the period (or its padded start) to the entry after it (or its padded end, capped
 * at `now`). With entries either side, the period's MMR change can be exact.
 */
export function loadWindow(
  entries: ReadonlyArray<{ observedAt: Date }>,
  period: { from: DayKey; to: DayKey },
  now: Date,
): { from: Date; to: Date } {
  const start = new Date(Date.parse(`${period.from}T00:00:00Z`) - TZ_PAD_MS);
  const end = new Date(Date.parse(`${period.to}T23:59:59Z`) + TZ_PAD_MS);
  const before = entries.findLast((e) => e.observedAt < start);
  const after = entries.find((e) => e.observedAt > end);
  return {
    from: before?.observedAt ?? start,
    to: after?.observedAt ?? (end < now ? end : now),
  };
}
