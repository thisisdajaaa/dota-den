import type { DataOwner } from "@/common/privacy/user-data";
import type { Result } from "@/common/result";
import type { PairClassification } from "@/modules/together/domain/pair";
import type { Group, GroupMember } from "./domain/group";
import type { HeroPlay } from "./domain/member-activity";

export type ProviderError =
  | { type: "rate_limited"; retryAfterMs: number | null }
  | { type: "unavailable"; cause: string }
  | { type: "not_found" }
  | { type: "invalid_payload"; cause: string };

/** Storage for groups (collection `groups`). */
export interface GroupsRepositoryPort {
  create(input: {
    name: string;
    owner: GroupMember;
    inviteToken: string;
    now: Date;
  }): Promise<Group>;
  findById(id: string): Promise<Group | null>;
  findByInviteToken(token: string): Promise<Group | null>;
  /** Groups the user is a member of (owner included), newest first. */
  listForUser(userId: string): Promise<Group[]>;
  countForUser(userId: string): Promise<number>;
  /** Adds the member if not already in and the group has room; null otherwise. */
  addMember(id: string, member: GroupMember, maxMembers: number, now: Date): Promise<Group | null>;
  removeMember(id: string, userId: string, now: Date): Promise<boolean>;
  setOwner(id: string, userId: string, now: Date): Promise<void>;
  rename(id: string, name: string, now: Date): Promise<void>;
  setInviteToken(id: string, token: string, now: Date): Promise<void>;
  delete(id: string): Promise<boolean>;
  pairsRefreshedAt(id: string): Promise<Record<string, Date>>;
  markPairsRefreshed(id: string, keys: readonly string[], at: Date): Promise<void>;
  /** The groups the user is in, as they appear in "Download your data". */
  exportForMember(owner: DataOwner): Promise<Record<string, unknown>[]>;
}

/** Steam names and avatars of members (stored at sign-in, else OpenDota's public profile). */
export interface MemberProfiles {
  profiles(
    members: readonly { userId: string; accountId32: number }[],
  ): Promise<Map<number, { personaName: string | null; avatarUrl: string | null }>>;
}

/** The Together feature: cached party classifications and checking a pair's shared matches. */
export interface PartySource {
  sameTeamAmong(accountIds: readonly number[]): Promise<PairClassification[]>;
  analysePair(
    a: number,
    b: number,
    opts: { maxNewDetails: number },
  ): Promise<Result<{ pending: number; interrupted: boolean }, ProviderError>>;
}

/** Members' imported matches (public match data). */
export interface MemberGamesSource {
  /** Games in the last `days` days (any mode). */
  recentHeroes(accountId32: number, now: Date, days: number): Promise<HeroPlay[]>;
  /** Ranked results between two instants. */
  rankedResults(accountId32: number, from: Date, to: Date): Promise<Array<"win" | "loss">>;
}
