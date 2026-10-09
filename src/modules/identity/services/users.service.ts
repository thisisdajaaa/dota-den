import type { DataOwner } from "@/common/privacy/user-data";
import type { ProfileVisibility, User } from "../domain/user";
import type { AdminUserRow } from "../identity.model";

/** What UsersService needs from storage. */
export interface UsersStore {
  findByIds(ids: readonly string[]): Promise<User[]>;
  findByAccountIds(accountIds: readonly number[]): Promise<User[]>;
  findPublicIds(limit: number): Promise<string[]>;
  setProfileVisibility(id: string, visibility: ProfileVisibility, now: Date): Promise<boolean>;
  setLanguage(id: string, language: string, now: Date): Promise<boolean>;
  adminRows(): Promise<AdminUserRow[]>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface SessionsStore {
  deleteForOwner(owner: DataOwner): Promise<number>;
  /** Days each user's sign-in sessions were created or refreshed (UTC, YYYY-MM-DD). */
  activityDays(userIds: readonly string[]): Promise<Map<string, string[]>>;
}

export interface VisitsStore {
  record(userId: string, day: string, at: Date): Promise<void>;
  daysByUser(userIds: readonly string[]): Promise<Map<string, string[]>>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Accounts: lookups for other features, profile visibility, and account data. */
export class UsersService {
  constructor(
    private readonly deps: {
      users: UsersStore;
      sessions: SessionsStore;
      visits: VisitsStore;
      now?: () => Date;
    },
  ) {}

  /** Last day recorded per user on this server: one write per player per day at most. */
  private readonly recorded = new Map<string, string>();

  /** Notes that the player opened the app today (UTC). Best effort; never throws. */
  async recordVisit(userId: string): Promise<void> {
    const now = this.deps.now?.() ?? new Date();
    const day = utcDay(now);
    if (this.recorded.get(userId) === day) return;
    this.recorded.set(userId, day);
    await this.deps.visits.record(userId, day, now).catch(() => this.recorded.delete(userId));
  }

  /**
   * Days each player was active: recorded visits, plus the days their sign-in sessions were
   * created or refreshed (which covers the time before visits were recorded).
   */
  async activeDays(userIds: readonly string[]): Promise<Map<string, string[]>> {
    const [visits, sessions] = await Promise.all([
      this.deps.visits.daysByUser(userIds),
      this.deps.sessions.activityDays(userIds),
    ]);
    const out = new Map<string, string[]>();
    for (const id of userIds) {
      const days = new Set([...(visits.get(id) ?? []), ...(sessions.get(id) ?? [])]);
      if (days.size) out.set(id, [...days].sort());
    }
    return out;
  }

  /** Users by id, for views that list other players. Missing ids are skipped. */
  findByIds(ids: readonly string[]) {
    return this.deps.users.findByIds(ids);
  }

  /** The Dota Den users among these Steam accounts. */
  findByAccountIds(accountIds: readonly number[]) {
    return this.deps.users.findByAccountIds(accountIds);
  }

  /** Users who chose to be listed publicly (capped: the Everyone leaderboards read this). */
  findPublicIds(limit = 5_000) {
    return this.deps.users.findPublicIds(limit);
  }

  /** Who can see a user's profile and activity. "public" lists them on Everyone boards. */
  setProfileVisibility(userId: string, visibility: ProfileVisibility) {
    return this.deps.users.setProfileVisibility(
      userId,
      visibility,
      this.deps.now?.() ?? new Date(),
    );
  }

  /** Remember the user's UI language across devices. */
  setLanguage(userId: string, language: string) {
    return this.deps.users.setLanguage(userId, language, this.deps.now?.() ?? new Date());
  }

  adminRows() {
    return this.deps.users.adminRows();
  }

  /** Your account (no session tokens). */
  async exportMyData(owner: DataOwner) {
    const [account, visitDays] = await Promise.all([
      this.deps.users.exportForOwner(owner),
      this.deps.visits.exportForOwner(owner),
    ]);
    return { account, visitDays };
  }

  /** Removes every sign-in session, then the account. Run last: it signs the player out. */
  async deleteMyData(owner: DataOwner) {
    const visitDays = await this.deps.visits.deleteForOwner(owner);
    const sessions = await this.deps.sessions.deleteForOwner(owner);
    const account = await this.deps.users.deleteForOwner(owner);
    return { account, sessions, visitDays };
  }
}
