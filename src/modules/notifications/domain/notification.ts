import { addDays, weekday, type DayKey } from "@/common/time/day-key";

/** What a player can be notified about. Each can be turned off separately. */
export const NOTIFICATION_KINDS = ["session_recap", "weekly_recap", "patch_heroes"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationPrefs = Record<NotificationKind, boolean>;

/** Subscribing turns everything on; the player turns off what they don't want. */
export const DEFAULT_PREFS: NotificationPrefs = {
  session_recap: true,
  weekly_recap: true,
  patch_heroes: true,
};

/** What the service worker shows. `tag` replaces an older notification with the same tag. */
export interface NotificationMessage {
  title: string;
  body: string;
  /** Path inside the app to open on click. */
  url: string;
  tag: string;
}

/**
 * A session is finished once the break after its last game is longer than the player's
 * session gap: a new game after that would start a new session.
 */
export function isSessionFinished(endedAt: Date, gapMinutes: number, now: Date): boolean {
  return now.getTime() - endedAt.getTime() > gapMinutes * 60_000;
}

/** Only recap sessions from about the last day: older ones are news nobody wants. */
export const SESSION_RECAP_MAX_AGE_MS = 36 * 3_600_000;

export function isRecentSession(endedAt: Date, now: Date): boolean {
  return now.getTime() - endedAt.getTime() <= SESSION_RECAP_MAX_AGE_MS;
}

/** The Monday that starts the week of `today` (weeks run Monday to Sunday). */
export function weekStart(today: DayKey): DayKey {
  return addDays(today, -((weekday(today) + 6) % 7));
}

/** The weekly recap goes out on Mondays (in the player's time zone), about last week. */
export function isRecapDay(today: DayKey): boolean {
  return weekday(today) === 1;
}

/** Patch news is only news for a week after the patch. */
export const PATCH_NEWS_MAX_AGE_MS = 7 * 24 * 3_600_000;

export function isRecentPatch(publishedAt: Date, now: Date): boolean {
  return now.getTime() - publishedAt.getTime() <= PATCH_NEWS_MAX_AGE_MS;
}

/**
 * The browsers' push services. The server POSTs to a subscription's endpoint, so only these
 * hosts are accepted: anything else would let a crafted subscription make the server call
 * an arbitrary URL.
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  ".push.apple.com",
  ".notify.windows.com",
] as const;

export function isPushServiceEndpoint(
  endpoint: string,
  hosts: readonly string[] = PUSH_SERVICE_HOSTS,
): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return hosts.some((h) => (h.startsWith(".") ? url.hostname.endsWith(h) : url.hostname === h));
}

/** A push subscription is dead when the push service says the endpoint is gone. */
export function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}
