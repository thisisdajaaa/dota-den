/**
 * Groups: a named stack of Dota Den players (pure rules). One owner, members join by an
 * invite link. Membership is the consent to share party records, recent heroes and ranked
 * wins and losses with the other members; never MMR, notes, goals or sessions (ADR 0012).
 */

/** Members per group, owner included (two full stacks). */
export const MAX_GROUP_MEMBERS = 10;
/** Groups a player can be in at once, owned or joined. */
export const MAX_GROUPS_PER_USER = 5;
export const MIN_GROUP_NAME = 2;
export const MAX_GROUP_NAME = 40;

/** Invite tokens: 24 characters from a 62-letter alphabet (~143 bits, not guessable). */
export const INVITE_TOKEN_LENGTH = 24;
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9]{24}$/;
/** Group ids are MongoDB ObjectIds (24 hex characters). */
export const GROUP_ID_PATTERN = /^[a-f0-9]{24}$/;

export interface GroupMember {
  userId: string;
  accountId32: number;
  joinedAt: Date;
}

export interface Group {
  id: string;
  name: string;
  ownerUserId: string;
  inviteToken: string;
  /** Oldest member first. */
  members: GroupMember[];
  createdAt: Date;
  updatedAt: Date;
}

/** Collapses runs of whitespace and trims; the length rules apply to the result. */
export function normaliseGroupName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export const isMember = (group: Pick<Group, "members">, userId: string): boolean =>
  group.members.some((m) => m.userId === userId);

export const isOwner = (group: Pick<Group, "ownerUserId">, userId: string): boolean =>
  group.ownerUserId === userId;

export type JoinRefusal = "already_member" | "group_full" | "too_many_groups";

/** Whether a player may join: not already in it, room left, and under their own group cap. */
export function joinRefusal(
  group: Pick<Group, "members">,
  userId: string,
  groupsJoined: number,
): JoinRefusal | null {
  if (isMember(group, userId)) return "already_member";
  if (group.members.length >= MAX_GROUP_MEMBERS) return "group_full";
  if (groupsJoined >= MAX_GROUPS_PER_USER) return "too_many_groups";
  return null;
}

/**
 * Who takes over when the owner leaves or deletes their account: the longest-standing other
 * member (ties by user id, so it is deterministic). Null when nobody else is left, and the
 * group is then deleted.
 */
export function nextOwner(
  group: Pick<Group, "members">,
  leavingUserId: string,
): GroupMember | null {
  return (
    [...group.members]
      .filter((m) => m.userId !== leavingUserId)
      .sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId),
      )[0] ?? null
  );
}

/** Every unordered pair of member accounts (each party pair the group page checks). */
export function memberPairs(accountIds: readonly number[]): Array<[number, number]> {
  const ids = [...new Set(accountIds)].sort((a, b) => a - b);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  return pairs;
}

export const pairKey = ([a, b]: readonly [number, number]): string =>
  a < b ? `${a}:${b}` : `${b}:${a}`;

/** How long a pair's shared matches count as fresh before a visit checks them again. */
export const PAIR_REFRESH_MS = 6 * 60 * 60 * 1000;
/** Pairs checked against OpenDota per group page visit (one list call each, plus details). */
export const MAX_PAIRS_PER_VISIT = 2;
/** Match details fetched per pair on a visit: two pairs share the Together page's budget of 30. */
export const DETAILS_PER_PAIR = 15;

/**
 * The pairs to check on this visit: never checked first, then the stalest, skipping any
 * checked within PAIR_REFRESH_MS.
 */
export function pairsToRefresh(
  pairs: ReadonlyArray<[number, number]>,
  refreshedAt: Readonly<Record<string, Date>>,
  now: Date,
  limit = MAX_PAIRS_PER_VISIT,
): Array<[number, number]> {
  return pairs
    .map((p) => ({ p, at: refreshedAt[pairKey(p)]?.getTime() ?? null }))
    .filter((x) => x.at === null || now.getTime() - x.at >= PAIR_REFRESH_MS)
    .sort((a, b) => (a.at ?? -1) - (b.at ?? -1))
    .slice(0, limit)
    .map((x) => x.p);
}
