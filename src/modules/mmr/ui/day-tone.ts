import type { CalendarDay } from "../domain/calendar";
import { dayValue } from "../domain/calendar";

export type DayBasis = "actual" | "estimate" | "none";

export function basisOf(day: CalendarDay | undefined): DayBasis {
  if (!day) return "none";
  if (day.actualDelta !== null) return "actual";
  return day.games > 0 ? "estimate" : "none";
}

/** Signed label: "+50", "−25", "±0"; estimates get a leading "≈". */
export function deltaLabel(day: CalendarDay | undefined): string | null {
  const basis = basisOf(day);
  if (!day || basis === "none") return null;
  const v = dayValue(day);
  const num = v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0";
  return basis === "estimate" ? `≈ ${num}` : num;
}

/**
 * Background for a day cell: win/loss hue, opacity by magnitude relative to the period's
 * largest swing (floor of 50 so a single game doesn't look like a huge day).
 */
export function dayStyle(day: CalendarDay | undefined, scale: number): React.CSSProperties {
  const basis = basisOf(day);
  if (!day || basis === "none") return {};
  const v = dayValue(day);
  if (v === 0) return { backgroundColor: "oklch(1 0 0 / 0.06)" };
  const intensity = Math.min(1, Math.abs(v) / Math.max(50, scale));
  const alpha =
    (basis === "estimate" ? 0.08 : 0.14) + intensity * (basis === "estimate" ? 0.3 : 0.55);
  const color = v > 0 ? "var(--win)" : "var(--loss)";
  return {
    backgroundColor: `color-mix(in oklch, ${color} ${Math.round(alpha * 100)}%, transparent)`,
  };
}

export function periodScale(days: Iterable<CalendarDay>): number {
  let max = 0;
  for (const d of days) max = Math.max(max, Math.abs(dayValue(d)));
  return max;
}
