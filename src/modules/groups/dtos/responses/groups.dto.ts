import type { BoardRow, HeroCount } from "../../domain/member-activity";
import type { GroupPartyStats } from "../../domain/group-stats";

/** A row of the /groups list. */
export interface GroupSummaryDto {
  id: string;
  name: string;
  isOwner: boolean;
  memberCount: number;
}

export interface GroupMemberDto {
  accountId32: number;
  name: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  you: boolean;
  joinedAt: Date;
}

/** The group as its members see it. */
export interface GroupDto {
  id: string;
  name: string;
  isOwner: boolean;
  /** Path of the invite link (`/groups/join/<token>`); members can pass it on. */
  invitePath: string;
  members: GroupMemberDto[];
  createdAt: Date;
}

/** What an invite link shows before joining. */
export interface InvitePreviewDto {
  id: string;
  name: string;
  memberCount: number;
  ownerName: string | null;
  alreadyMember: boolean;
  /** Why joining would fail, if it would. */
  refusal: "group_full" | "too_many_groups" | null;
}

export interface GroupPartyDto {
  stats: Omit<GroupPartyStats, "parties">;
  /** Newest parties (up to 10), for "recent games together". */
  recent: GroupPartyStats["parties"];
  /** Member pairs whose shared matches haven't been checked yet. */
  pairsUnchecked: number;
  pairsTotal: number;
  /** OpenDota was busy or down on this visit: numbers may be behind. */
  upstreamBusy: boolean;
}

export interface MemberHeroesDto {
  accountId32: number;
  games: number;
  heroes: HeroCount[];
}

export interface WeeklyBoardDto {
  rows: BoardRow[];
  idle: number[];
  from: Date;
  to: Date;
}
