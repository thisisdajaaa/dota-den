import { ConflictError, ForbiddenError, NotFoundError } from "@/common/errors/app-error";
import type { DataOwner } from "@/common/privacy/user-data";
import {
  isMember,
  isOwner,
  joinRefusal,
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_PER_USER,
  nextOwner,
  type Group,
} from "../domain/group";
import type { GroupDto, GroupSummaryDto, InvitePreviewDto } from "../dtos/responses/groups.dto";
import type { GroupsRepositoryPort, MemberProfiles } from "../groups.ports";

/** Who is acting: a signed-in Dota Den player. */
export interface Actor {
  id: string;
  accountId32: number;
}

/** Creating, joining, leaving and managing groups. */
export class GroupsService {
  constructor(
    private readonly deps: {
      repository: GroupsRepositoryPort;
      profiles: MemberProfiles;
      newToken: () => string;
      /** The player's group cap: Plus doubles it (ADR 0013). Default MAX_GROUPS_PER_USER. */
      groupLimit?: (userId: string, base: number) => Promise<number>;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  /** How many groups this player may be in at once. */
  groupLimit(userId: string): Promise<number> {
    return this.deps.groupLimit
      ? this.deps.groupLimit(userId, MAX_GROUPS_PER_USER)
      : Promise.resolve(MAX_GROUPS_PER_USER);
  }

  private tooMany(max: number) {
    return new ConflictError(`You can be in at most ${max} groups.`, {
      reason: "too_many_groups",
      max,
    });
  }

  async listMine(user: Actor): Promise<GroupSummaryDto[]> {
    const groups = await this.deps.repository.listForUser(user.id);
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      isOwner: isOwner(g, user.id),
      memberCount: g.members.length,
    }));
  }

  async create(user: Actor, name: string): Promise<GroupSummaryDto> {
    const max = await this.groupLimit(user.id);
    if ((await this.deps.repository.countForUser(user.id)) >= max) throw this.tooMany(max);
    const now = this.now();
    const group = await this.deps.repository.create({
      name,
      owner: { userId: user.id, accountId32: user.accountId32, joinedAt: now },
      inviteToken: this.deps.newToken(),
      now,
    });
    return { id: group.id, name: group.name, isOwner: true, memberCount: 1 };
  }

  /** The group, for one of its members; null for anyone else (no hint it exists). */
  async findForMember(user: Actor, id: string): Promise<Group | null> {
    const group = await this.deps.repository.findById(id);
    return group && isMember(group, user.id) ? group : null;
  }

  /** Like findForMember, but "not found" is an error (for API calls). */
  async forMember(user: Actor, id: string): Promise<Group> {
    const group = await this.findForMember(user, id);
    if (!group) throw new NotFoundError("Group not found");
    return group;
  }

  async view(user: Actor, group: Group): Promise<GroupDto> {
    const profiles = await this.deps.profiles.profiles(group.members);
    return {
      id: group.id,
      name: group.name,
      isOwner: isOwner(group, user.id),
      invitePath: `/groups/join/${group.inviteToken}`,
      members: group.members.map((m) => ({
        accountId32: m.accountId32,
        name: profiles.get(m.accountId32)?.personaName ?? null,
        avatarUrl: profiles.get(m.accountId32)?.avatarUrl ?? null,
        isOwner: m.userId === group.ownerUserId,
        you: m.userId === user.id,
        joinedAt: m.joinedAt,
      })),
      createdAt: group.createdAt,
    };
  }

  async invitePreview(user: Actor, token: string): Promise<InvitePreviewDto | null> {
    const group = await this.deps.repository.findByInviteToken(token);
    if (!group) return null;
    const [count, max] = await Promise.all([
      this.deps.repository.countForUser(user.id),
      this.groupLimit(user.id),
    ]);
    const refusal = joinRefusal(group, user.id, count, max);
    const owner = group.members.find((m) => m.userId === group.ownerUserId);
    const profiles = owner ? await this.deps.profiles.profiles([owner]) : new Map();
    return {
      id: group.id,
      name: group.name,
      memberCount: group.members.length,
      ownerName: owner ? (profiles.get(owner.accountId32)?.personaName ?? null) : null,
      alreadyMember: refusal === "already_member",
      refusal: refusal === "already_member" ? null : refusal,
    };
  }

  /** Joins by invite token. Joining a group you're already in is a no-op. */
  async join(user: Actor, token: string): Promise<GroupSummaryDto> {
    const group = await this.deps.repository.findByInviteToken(token);
    if (!group) throw new NotFoundError("This invite link doesn't work any more.");
    const [count, max] = await Promise.all([
      this.deps.repository.countForUser(user.id),
      this.groupLimit(user.id),
    ]);
    const refusal = joinRefusal(group, user.id, count, max);
    if (refusal === "group_full")
      throw new ConflictError(`This group is full (${MAX_GROUP_MEMBERS} members).`, {
        reason: refusal,
      });
    if (refusal === "too_many_groups") throw this.tooMany(max);
    let joined = group;
    if (refusal === null) {
      const updated = await this.deps.repository.addMember(
        group.id,
        { userId: user.id, accountId32: user.accountId32, joinedAt: this.now() },
        MAX_GROUP_MEMBERS,
        this.now(),
      );
      // Lost a race for the last seat (or joined twice at once).
      if (!updated) {
        const again = await this.deps.repository.findById(group.id);
        if (!again || !isMember(again, user.id))
          throw new ConflictError(`This group is full (${MAX_GROUP_MEMBERS} members).`, {
            reason: "group_full",
          });
        joined = again;
      } else joined = updated;
    }
    return {
      id: joined.id,
      name: joined.name,
      isOwner: isOwner(joined, user.id),
      memberCount: joined.members.length,
    };
  }

  /**
   * Leave a group. When the owner leaves, the longest-standing member takes over; the last
   * member leaving deletes the group.
   */
  async leave(user: Actor, id: string): Promise<{ deleted: boolean }> {
    const group = await this.forMember(user, id);
    return this.removeFrom(group, user.id);
  }

  private async removeFrom(group: Group, userId: string): Promise<{ deleted: boolean }> {
    if (isOwner(group, userId)) {
      const heir = nextOwner(group, userId);
      if (!heir) {
        await this.deps.repository.delete(group.id);
        return { deleted: true };
      }
      await this.deps.repository.setOwner(group.id, heir.userId, this.now());
    }
    await this.deps.repository.removeMember(group.id, userId, this.now());
    return { deleted: false };
  }

  private async ownedBy(user: Actor, id: string): Promise<Group> {
    const group = await this.forMember(user, id);
    if (!isOwner(group, user.id)) throw new ForbiddenError("Only the group's owner can do that.");
    return group;
  }

  async removeMember(user: Actor, id: string, accountId32: number): Promise<void> {
    const group = await this.ownedBy(user, id);
    const member = group.members.find((m) => m.accountId32 === accountId32);
    if (!member) throw new NotFoundError("Not a member of this group");
    if (member.userId === user.id)
      throw new ConflictError("Leave the group instead of removing yourself.");
    await this.deps.repository.removeMember(group.id, member.userId, this.now());
    // They saw the invite link: a new one, so being removed means staying out.
    await this.deps.repository.setInviteToken(group.id, this.deps.newToken(), this.now());
  }

  async rename(user: Actor, id: string, name: string): Promise<GroupSummaryDto> {
    const group = await this.ownedBy(user, id);
    await this.deps.repository.rename(group.id, name, this.now());
    return { id: group.id, name, isOwner: true, memberCount: group.members.length };
  }

  /** A new invite link; the old one stops working. */
  async resetInvite(user: Actor, id: string): Promise<{ invitePath: string }> {
    const group = await this.ownedBy(user, id);
    const token = this.deps.newToken();
    await this.deps.repository.setInviteToken(group.id, token, this.now());
    return { invitePath: `/groups/join/${token}` };
  }

  async delete(user: Actor, id: string): Promise<void> {
    const group = await this.ownedBy(user, id);
    await this.deps.repository.delete(group.id);
  }

  async exportMyData(owner: DataOwner) {
    return { groups: await this.deps.repository.exportForMember(owner) };
  }

  /**
   * Account deletion: you leave every group. Groups you own pass to their longest-standing
   * member; a group with nobody else in it is deleted.
   */
  async deleteMyData(owner: DataOwner) {
    let groupsDeleted = 0;
    let groupMemberships = 0;
    for (const group of await this.deps.repository.listForUser(owner.userId)) {
      const { deleted } = await this.removeFrom(group, owner.userId);
      groupMemberships++;
      if (deleted) groupsDeleted++;
    }
    return { groupMemberships, groupsDeleted };
  }
}
