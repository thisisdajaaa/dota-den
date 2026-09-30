import type { SessionMmr } from "./session-mmr";

/** Human labels for sessions in the viewer's time zone. Pure apart from Intl data. */

export interface SessionTimeLabels {
  /** e.g. "Tue, Sep 29, 2026" (the local day the session started). */
  date: string;
  /** e.g. "8:05 PM – 11:15 PM", with "(+1 day)" when it ran past local midnight. */
  timeRange: string;
  /** "YYYY-MM-DD" of the local start day. */
  dayKey: string;
}

export function sessionTimeLabels(
  startedAt: Date,
  endedAt: Date,
  timeZone: string,
): SessionTimeLabels {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(startedAt);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const startDay = day.format(startedAt);
  const endDay = day.format(endedAt);
  const extraDays = Math.round(
    (Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / 86_400_000,
  );
  const suffix = extraDays > 0 ? ` (+${extraDays} day${extraDays === 1 ? "" : "s"})` : "";
  return {
    date,
    timeRange: `${time.format(startedAt)} – ${time.format(endedAt)}${suffix}`,
    dayKey: startDay,
  };
}

/** "3h 10m", "45m", "0m". */
export function formatSpan(sec: number): string {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "+50", "−25", "±0" (true minus sign). */
export function signedMmr(v: number): string {
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "±0";
}

/** Short MMR label: "+50 MMR (exact)", "≈ −25 MMR (estimate)", or null with no ranked games. */
export function mmrLabel(mmr: SessionMmr): string | null {
  if (mmr.kind === "none") return null;
  return mmr.kind === "exact"
    ? `${signedMmr(mmr.delta)} MMR (exact)`
    : `≈ ${signedMmr(mmr.delta)} MMR (estimate)`;
}

/** One-sentence recap, e.g. "4–2 in 3h 10m, +50 MMR (exact)". */
export function recapHeadline(
  stats: { wins: number; losses: number; spanSec: number },
  mmr: SessionMmr,
): string {
  const base = `${stats.wins}–${stats.losses} in ${formatSpan(stats.spanSec)}`;
  const label = mmrLabel(mmr);
  return label ? `${base}, ${label}` : `${base}, no ranked games`;
}
