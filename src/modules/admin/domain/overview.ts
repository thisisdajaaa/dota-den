/** The admin overview's headline numbers (pure). */

export interface AdminUser {
  createdAt: Date;
  lastSeenAt: Date | null;
  matches: number;
  profileVisibility: string;
}

export interface AdminTotals {
  users: number;
  newThisWeek: number;
  activeToday: number;
  activeThisWeek: number;
  withMatches: number;
  listedPublicly: number;
}

const DAY = 86_400_000;

export function adminTotals(users: readonly AdminUser[], now: Date): AdminTotals {
  const within = (d: Date | null, ms: number) => d !== null && now.getTime() - d.getTime() <= ms;
  return {
    users: users.length,
    newThisWeek: users.filter((u) => within(u.createdAt, 7 * DAY)).length,
    activeToday: users.filter((u) => within(u.lastSeenAt, DAY)).length,
    activeThisWeek: users.filter((u) => within(u.lastSeenAt, 7 * DAY)).length,
    withMatches: users.filter((u) => u.matches > 0).length,
    listedPublicly: users.filter((u) => u.profileVisibility === "public").length,
  };
}
