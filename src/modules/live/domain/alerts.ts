/**
 * Go-live alerts (pure): which live streams are news, and the once-per-stream key.
 */
import type { Platform } from "./platform";

/**
 * A stream is "going live" news for this long after it started. Runs are a few minutes apart;
 * the margin covers a missed run or two, but a stream that has been on for hours (say, someone
 * just followed the channel, or alerts were off) isn't announced.
 */
export const ALERT_MAX_AGE_MS = 45 * 60_000;

/** True when a stream that started at `startedAt` (ISO) is still news at `now`. */
export function isFreshStart(startedAt: string | null, now: Date): boolean {
  // A site that doesn't say when the stream started: announce it (once per day, see alertKey).
  if (!startedAt) return true;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return true;
  const age = now.getTime() - t;
  // A little clock skew either way is fine.
  return age >= -5 * 60_000 && age <= ALERT_MAX_AGE_MS;
}

/**
 * The notification log key for one stream session of a channel: its start time, so the same
 * stream is announced once however many runs see it, and the next stream is announced again.
 * Without a start time, at most once per UTC day.
 */
export function alertKey(
  platform: Platform,
  channelId: string,
  startedAt: string | null,
  now: Date,
): string {
  const t = startedAt ? Date.parse(startedAt) : Number.NaN;
  const session = Number.isNaN(t)
    ? `day-${now.toISOString().slice(0, 10)}`
    : new Date(t).toISOString();
  return `${platform}:${channelId}:${session}`;
}
