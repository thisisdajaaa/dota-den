import { displayName } from "@/modules/players/ui/player-avatar";
import type { GroupMemberDto } from "../dtos/responses/groups.dto";

export type MemberLookup = Map<number, Pick<GroupMemberDto, "name" | "avatarUrl" | "you">>;

export function memberLookup(members: readonly GroupMemberDto[]): MemberLookup {
  return new Map(members.map((m) => [m.accountId32, m]));
}

/** A member's Steam name (or "Player <id>"). */
export function memberName(members: MemberLookup, accountId32: number): string {
  return displayName(members.get(accountId32)?.name ?? null, accountId32);
}
