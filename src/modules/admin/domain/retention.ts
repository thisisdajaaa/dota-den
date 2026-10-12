/** Who keeps coming back (pure). Days are UTC "YYYY-MM-DD" keys. */

export interface RetentionUser {
  createdAt: Date;
  /** Days the player was active, any order. */
  activeDays: readonly string[];
}

export interface SignupWeek {
  /** Monday (UTC) starting the week the players signed up. */
  week: string;
  signedUp: number;
  /** Came back on another day within 7 days of signing up. */
  returnedWithin7: number;
  /** Came back on any later day. */
  returnedEver: number;
}

export interface Retention {
  active1: number;
  active7: number;
  active30: number;
  /** Active on at least one day after the day they signed up. */
  returning: number;
  weeks: SignupWeek[];
}

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const dayMs = (key: string) => Date.parse(`${key}T00:00:00Z`);

function mondayOf(key: string): string {
  const d = new Date(dayMs(key));
  return dayKey(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
}

export function retention(users: readonly RetentionUser[], now: Date, weeks = 8): Retention {
  const today = dayMs(dayKey(now));
  const activeWithin = (u: RetentionUser, days: number) =>
    u.activeDays.some((d) => today - dayMs(d) < days * DAY);
  const later = (u: RetentionUser) => {
    const joined = dayKey(u.createdAt);
    return u.activeDays.filter((d) => d > joined);
  };

  const byWeek = new Map<string, SignupWeek>();
  for (const u of users) {
    const week = mondayOf(dayKey(u.createdAt));
    const row = byWeek.get(week) ?? { week, signedUp: 0, returnedWithin7: 0, returnedEver: 0 };
    const back = later(u);
    row.signedUp++;
    if (back.length) row.returnedEver++;
    const joined = dayMs(dayKey(u.createdAt));
    if (back.some((d) => dayMs(d) - joined <= 7 * DAY)) row.returnedWithin7++;
    byWeek.set(week, row);
  }

  return {
    active1: users.filter((u) => activeWithin(u, 1)).length,
    active7: users.filter((u) => activeWithin(u, 7)).length,
    active30: users.filter((u) => activeWithin(u, 30)).length,
    returning: users.filter((u) => later(u).length > 0).length,
    weeks: [...byWeek.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, weeks),
  };
}
