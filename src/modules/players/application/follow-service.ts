import { err, ok, type Result } from "@/modules/shared/domain/result";
import { MAX_FOLLOWS_PER_USER, type PlayerFollow } from "../domain/follow";
import { parseAccountId } from "../domain/player-lookup";
import type { FollowRepository } from "./ports";

/** The signed-in user. Every command is scoped to this owner; nobody can touch another's list. */
export interface FollowOwner {
  userId: string;
  accountId32: number;
}

/** The owner for a signed-in user (any object with the user's id and account). */
export function ownerOf(user: { id: string; accountId32: number }): FollowOwner {
  return { userId: user.id, accountId32: user.accountId32 };
}

export type FollowError =
  { type: "invalid_account" } | { type: "self" } | { type: "limit_reached"; limit: number };

export class FollowService {
  private readonly now: () => Date;
  private readonly limit: number;

  constructor(
    private readonly repo: FollowRepository,
    opts: { now?: () => Date; limit?: number } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
    this.limit = opts.limit ?? MAX_FOLLOWS_PER_USER;
  }

  /**
   * Start tracking a player. Idempotent: tracking someone already tracked returns the existing
   * follow with `created: false` (and never counts against the limit).
   */
  async follow(
    owner: FollowOwner,
    accountId32: number,
  ): Promise<Result<{ follow: PlayerFollow; created: boolean }, FollowError>> {
    if (parseAccountId(accountId32) === null) return err({ type: "invalid_account" });
    if (accountId32 === owner.accountId32) return err({ type: "self" });

    const existing = await this.repo.find(owner.userId, accountId32);
    if (existing) return ok({ follow: existing, created: false });

    // Concurrent requests can overshoot by a few; the limit bounds cost, it isn't a quota.
    if ((await this.repo.count(owner.userId)) >= this.limit)
      return err({ type: "limit_reached", limit: this.limit });

    const follow: PlayerFollow = { userId: owner.userId, accountId32, createdAt: this.now() };
    const created = await this.repo.add(follow);
    if (created) return ok({ follow, created: true });
    // Lost a race with an identical request: report the stored one.
    return ok({
      follow: (await this.repo.find(owner.userId, accountId32)) ?? follow,
      created: false,
    });
  }

  /** Stop tracking. Idempotent: `false` when the player wasn't tracked. */
  async unfollow(owner: FollowOwner, accountId32: number): Promise<boolean> {
    if (parseAccountId(accountId32) === null) return false;
    return this.repo.remove(owner.userId, accountId32);
  }

  list(owner: FollowOwner): Promise<PlayerFollow[]> {
    return this.repo.list(owner.userId);
  }

  async isFollowing(owner: FollowOwner, accountId32: number): Promise<boolean> {
    return (await this.repo.find(owner.userId, accountId32)) !== null;
  }
}
