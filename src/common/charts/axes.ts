/** Axis helpers shared by the hand-drawn SVG charts (pure, no React). */

const DAY_MS = 86_400_000;

/** Round MMR ticks (every 50, 100, 250, 500 or 1,000) giving a handful of lines. */
export function mmrTicks(lo: number, hi: number): { min: number; max: number; ticks: number[] } {
  const range = Math.max(hi - lo, 50);
  const step = [50, 100, 250, 500, 1000, 2000].find((s) => range / s <= 4) ?? 2000;
  const min = Math.floor((lo - range * 0.08) / step) * step;
  const max = Math.ceil((hi + range * 0.08) / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { min, max, ticks };
}

/**
 * The time axis covers the range picked, trimmed to where the data starts: a player first seen
 * in October shouldn't get a six-month chart that's empty until then.
 */
export function timeDomain(from: number, to: number, firstData: number | null) {
  if (firstData === null || firstData <= from) return { from, to };
  const lead = Math.max(2 * DAY_MS, (to - firstData) * 0.04);
  return { from: Math.max(from, firstData - lead), to };
}

/**
 * Axis ticks: month starts; the 1st and 15th under about three months; weekly (daily under a
 * week) when even those give fewer than three.
 */
export function timeTicks(from: number, to: number): { t: number; short: boolean }[] {
  const months: number[] = [];
  const c = new Date(from);
  c.setUTCHours(0, 0, 0, 0);
  c.setUTCDate(1);
  c.setUTCMonth(c.getUTCMonth() + 1);
  for (; c.getTime() <= to; c.setUTCMonth(c.getUTCMonth() + 1)) months.push(c.getTime());
  if (months.length >= 3) return months.map((t) => ({ t, short: false }));
  const out: { t: number; short: boolean }[] = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() <= 15 ? 15 : 1);
  if (d.getUTCDate() === 1) d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() <= to) {
    if (d.getTime() >= from) out.push({ t: d.getTime(), short: d.getUTCDate() !== 1 });
    if (d.getUTCDate() === 1) d.setUTCDate(15);
    else {
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  if (out.length >= 3) return out;
  // Under about six weeks: one tick a week (or a day, under a week).
  const stepDays = to - from > 8 * DAY_MS ? 7 : 1;
  const week: { t: number; short: boolean }[] = [];
  const w = new Date(from);
  w.setUTCHours(0, 0, 0, 0);
  w.setUTCDate(w.getUTCDate() + 1);
  for (; w.getTime() <= to; w.setUTCDate(w.getUTCDate() + stepDays))
    week.push({ t: w.getTime(), short: true });
  return week;
}

/** A short date for a time tick: "Oct", "Oct '25" across a year, "Oct 15" mid-month. */
export function tickLabel(tick: { t: number; short: boolean }, spanMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: tick.short ? "numeric" : undefined,
    year: !tick.short && spanMs > 330 * DAY_MS ? "2-digit" : undefined,
  }).format(new Date(tick.t));
}
