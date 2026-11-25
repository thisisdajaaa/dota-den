/** Where players drop off between signing in and paying (pure). Days are UTC "YYYY-MM-DD". */

export const FUNNEL_STEPS = ["signedUp", "imported", "returned", "trialed", "subscribed"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelUser {
  userId: string;
  createdAt: Date;
  matches: number;
  /** Days the player was active, any order; null when activity couldn't be loaded. */
  activeDays: readonly string[] | null;
}

export interface FunnelRow {
  step: FunnelStep;
  /** Players who reached this step; null when it couldn't be counted. */
  all: number | null;
  /** Of those who signed up in the last `recentDays` days. */
  recent: number | null;
}

/** "Joined lately" means within this many days. */
export const FUNNEL_RECENT_DAYS = 30;

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Each step counts the players who did it, out of everyone who signed in (steps aren't forced
 * to nest: a player can start a trial before importing a game). Visitors who never signed in
 * aren't tracked, so the funnel starts at the Steam sign-in.
 */
export function funnel(
  users: readonly FunnelUser[],
  plus: { trialed: readonly string[]; subscribed: readonly string[] } | null,
  now: Date,
): FunnelRow[] {
  const since = now.getTime() - FUNNEL_RECENT_DAYS * DAY;
  const recent = users.filter((u) => u.createdAt.getTime() >= since);
  const trialed = new Set(plus?.trialed ?? []);
  const subscribed = new Set(plus?.subscribed ?? []);
  const activityKnown = users.every((u) => u.activeDays !== null);
  const tests: Record<FunnelStep, ((u: FunnelUser) => boolean) | null> = {
    signedUp: () => true,
    imported: (u) => u.matches > 0,
    returned: activityKnown
      ? (u) => (u.activeDays ?? []).some((d) => d > dayKey(u.createdAt))
      : null,
    trialed: plus ? (u) => trialed.has(u.userId) : null,
    subscribed: plus ? (u) => subscribed.has(u.userId) : null,
  };
  return FUNNEL_STEPS.map((step) => {
    const test = tests[step];
    return {
      step,
      all: test ? users.filter(test).length : null,
      recent: test ? recent.filter(test).length : null,
    };
  });
}
