import type { DataOwner } from "@/common/privacy/user-data";

/** Counts the checklist reads from other features. Each may fail on its own. */
export interface OnboardingSources {
  matches(accountId32: number): Promise<number>;
  mmrEntries(owner: DataOwner): Promise<number>;
  watchedHeroes(userId: string): Promise<number>;
  goalsThisWeek(owner: DataOwner, timeZone: string): Promise<number>;
  /** Null when notifications aren't available. */
  notificationDevices(userId: string): Promise<number | null>;
}
