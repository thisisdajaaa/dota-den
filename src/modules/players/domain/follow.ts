/** A signed-in user keeping an eye on another player. Unique by (userId, accountId32). */
export interface PlayerFollow {
  userId: string;
  accountId32: number;
  createdAt: Date;
}

/** Keeps the tracked list (and the upstream calls it costs to render) bounded. */
export const MAX_FOLLOWS_PER_USER = 100;
