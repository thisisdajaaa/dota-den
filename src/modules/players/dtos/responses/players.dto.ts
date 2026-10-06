/** The signed-in user. Every command is scoped to this owner; nobody can touch another's list. */
export interface FollowOwner {
  userId: string;
  accountId32: number;
}

export type FollowError =
  { type: "invalid_account" } | { type: "self" } | { type: "limit_reached"; limit: number };
