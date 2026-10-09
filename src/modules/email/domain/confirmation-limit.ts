/**
 * How often a player can have a confirmation email sent (pure). Each send goes to an address
 * someone typed, so the limit protects strangers' inboxes and the sending domain's reputation.
 */

/** Wait at least this long between two confirmation emails. */
export const CONFIRM_MIN_INTERVAL_MS = 60_000;
/** At most this many confirmation emails a day, whatever the address. */
export const CONFIRM_MAX_PER_DAY = 5;
const DAY_MS = 24 * 3_600_000;

/** Send times still inside the daily window (what to keep on the subscription). */
export function recentSends(sends: readonly Date[], now: Date): Date[] {
  return sends.filter((d) => now.getTime() - d.getTime() < DAY_MS);
}

/** Null when another confirmation may go out now, else how long to wait. */
export function confirmationWaitMs(sends: readonly Date[], now: Date): number | null {
  const recent = recentSends(sends, now).sort((a, b) => a.getTime() - b.getTime());
  const last = recent.at(-1);
  if (last && now.getTime() - last.getTime() < CONFIRM_MIN_INTERVAL_MS)
    return CONFIRM_MIN_INTERVAL_MS - (now.getTime() - last.getTime());
  if (recent.length >= CONFIRM_MAX_PER_DAY)
    return DAY_MS - (now.getTime() - recent[recent.length - CONFIRM_MAX_PER_DAY].getTime());
  return null;
}
