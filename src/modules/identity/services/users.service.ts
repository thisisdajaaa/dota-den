import type { DataOwner } from "@/common/privacy/user-data";
import type { ProfileVisibility, User } from "../domain/user";
import type { AdminUserRow } from "../identity.model";

/** What UsersService needs from storage. */
export interface UsersStore {
  findByIds(ids: readonly string[]): Promise<User[]>;
  findByAccountIds(accountIds: readonly number[]): Promise<User[]>;
  findPublicIds(limit: number): Promise<string[]>;
  setProfileVisibility(id: string, visibility: ProfileVisibility, now: Date): Promise<boolean>;
  adminRows(): Promise<AdminUserRow[]>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface SessionsStore {
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** Accounts: lookups for other features, profile visibility, and account data. */
export class UsersService {
  constructor(
    private readonly deps: { users: UsersStore; sessions: SessionsStore; now?: () => Date },
  ) {}

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

  adminRows() {
    return this.deps.users.adminRows();
  }

  /** Your account (no session tokens). */
  async exportMyData(owner: DataOwner) {
    return { account: await this.deps.users.exportForOwner(owner) };
  }

  /** Removes every sign-in session, then the account. Run last: it signs the player out. */
  async deleteMyData(owner: DataOwner) {
    const sessions = await this.deps.sessions.deleteForOwner(owner);
    const account = await this.deps.users.deleteForOwner(owner);
    return { account, sessions };
  }
}
