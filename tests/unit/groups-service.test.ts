import { describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/common/errors/app-error";
import { err, ok } from "@/common/result";
import {
  DETAILS_PER_PAIR,
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_PER_USER,
  type Group,
  type GroupMember,
} from "@/modules/groups/domain/group";
import type { GroupsRepositoryPort, PartySource } from "@/modules/groups/groups.ports";
import { GroupPageService } from "@/modules/groups/services/group-page.service";
import { GroupsService } from "@/modules/groups/services/groups.service";
import type { PairClassification } from "@/modules/together/domain/pair";

class MemoryGroups implements GroupsRepositoryPort {
  groups = new Map<string, Group>();
  refreshed = new Map<string, Record<string, Date>>();
  private seq = 0;

  async create(input: { name: string; owner: GroupMember; inviteToken: string; now: Date }) {
    const id = (++this.seq).toString(16).padStart(24, "0");
    const g: Group = {
      id,
      name: input.name,
      ownerUserId: input.owner.userId,
      inviteToken: input.inviteToken,
      members: [input.owner],
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.groups.set(id, g);
    return structuredClone(g);
  }
  async findById(id: string) {
    const g = this.groups.get(id);
    return g ? structuredClone(g) : null;
  }
  async findByInviteToken(token: string) {
    const g = [...this.groups.values()].find((x) => x.inviteToken === token);
    return g ? structuredClone(g) : null;
  }
  async listForUser(userId: string) {
    return [...this.groups.values()]
      .filter((g) => g.members.some((m) => m.userId === userId))
      .map((g) => structuredClone(g));
  }
  async countForUser(userId: string) {
    return (await this.listForUser(userId)).length;
  }
  async addMember(id: string, member: GroupMember, max: number) {
    const g = this.groups.get(id);
    if (!g || g.members.some((m) => m.userId === member.userId) || g.members.length >= max)
      return null;
    g.members.push(member);
    return structuredClone(g);
  }
  async removeMember(id: string, userId: string) {
    const g = this.groups.get(id);
    if (!g) return false;
    const before = g.members.length;
    g.members = g.members.filter((m) => m.userId !== userId);
    return g.members.length < before;
  }
  async setOwner(id: string, userId: string) {
    const g = this.groups.get(id);
    if (g) g.ownerUserId = userId;
  }
  async rename(id: string, name: string) {
    const g = this.groups.get(id);
    if (g) g.name = name;
  }
  async setInviteToken(id: string, token: string) {
    const g = this.groups.get(id);
    if (g) g.inviteToken = token;
  }
  async delete(id: string) {
    return this.groups.delete(id);
  }
  async pairsRefreshedAt(id: string) {
    return { ...(this.refreshed.get(id) ?? {}) };
  }
  async markPairsRefreshed(id: string, keys: readonly string[], at: Date) {
    const r = this.refreshed.get(id) ?? {};
    for (const k of keys) r[k] = at;
    this.refreshed.set(id, r);
  }
  async exportForMember(owner: { userId: string }) {
    return (await this.listForUser(owner.userId)).map((g) => ({ id: g.id, name: g.name }));
  }
}

const alice = { id: "alice", accountId32: 1 };
const bob = { id: "bob", accountId32: 2 };
const carol = { id: "carol", accountId32: 3 };

function setup(groupLimit?: (userId: string, base: number) => Promise<number>) {
  const repo = new MemoryGroups();
  let tokens = 0;
  let clock = Date.UTC(2026, 9, 1);
  const service = new GroupsService({
    repository: repo,
    profiles: {
      profiles: async (members) =>
        new Map(
          members.map((m) => [
            m.accountId32,
            { personaName: `P${m.accountId32}`, avatarUrl: null },
          ]),
        ),
    },
    newToken: () => `token${++tokens}`.padEnd(24, "x"),
    groupLimit,
    now: () => new Date((clock += 60_000)),
  });
  return { repo, service };
}

describe("GroupsService", () => {
  it("creates a group, joins by link, and only members can see it", async () => {
    const { service } = setup();
    const created = await service.create(alice, "Friday stack");
    const group = await service.forMember(alice, created.id);
    expect(group.members.map((m) => m.userId)).toEqual(["alice"]);

    await expect(service.forMember(bob, created.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await service.findForMember(bob, created.id)).toBeNull();

    const preview = await service.invitePreview(bob, group.inviteToken);
    expect(preview).toMatchObject({ name: "Friday stack", memberCount: 1, ownerName: "P1" });
    const joined = await service.join(bob, group.inviteToken);
    expect(joined).toMatchObject({ id: created.id, isOwner: false, memberCount: 2 });
    // Joining twice is a no-op.
    expect((await service.join(bob, group.inviteToken)).memberCount).toBe(2);
    expect((await service.invitePreview(bob, group.inviteToken))?.alreadyMember).toBe(true);

    const view = await service.view(bob, await service.forMember(bob, created.id));
    expect(view.members.map((m) => [m.name, m.isOwner, m.you])).toEqual([
      ["P1", true, false],
      ["P2", false, true],
    ]);
    expect(view.invitePath).toBe(`/groups/join/${group.inviteToken}`);
  });

  it("lets a Plus player be in twice as many groups (ADR 0013)", async () => {
    const { service, repo } = setup(async (userId, base) => (userId === "alice" ? base * 2 : base));
    expect(await service.groupLimit("alice")).toBe(MAX_GROUPS_PER_USER * 2);
    for (let i = 0; i < MAX_GROUPS_PER_USER * 2; i++) await service.create(alice, `G${i}`);
    await expect(service.create(alice, "one more")).rejects.toMatchObject({
      details: { reason: "too_many_groups", max: MAX_GROUPS_PER_USER * 2 },
    });
    // Bob is on the free cap: joining a sixth group is refused.
    for (let i = 0; i < MAX_GROUPS_PER_USER; i++) await service.create(bob, `B${i}`);
    const token = [...repo.groups.values()][0].inviteToken;
    expect((await service.invitePreview(bob, token))?.refusal).toBe("too_many_groups");
  });

  it("caps groups per player and members per group", async () => {
    const { service, repo } = setup();
    for (let i = 0; i < MAX_GROUPS_PER_USER; i++) await service.create(alice, `G${i}`);
    await expect(service.create(alice, "one more")).rejects.toBeInstanceOf(ConflictError);

    const g = await service.create(bob, "Full");
    const group = repo.groups.get(g.id)!;
    for (let i = group.members.length; i < MAX_GROUP_MEMBERS; i++)
      group.members.push({ userId: `x${i}`, accountId32: 100 + i, joinedAt: new Date() });
    await expect(service.join(carol, group.inviteToken)).rejects.toBeInstanceOf(ConflictError);
    expect((await service.invitePreview(carol, group.inviteToken))?.refusal).toBe("group_full");
  });

  it("lets only the owner rename, reset the link, remove members and delete", async () => {
    const { service } = setup();
    const { id } = await service.create(alice, "Stack");
    const old = (await service.forMember(alice, id)).inviteToken;
    await service.join(bob, old);
    await service.join(carol, old);

    await expect(service.rename(bob, id, "Mine now")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.removeMember(bob, id, 3)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.delete(bob, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.resetInvite(bob, id)).rejects.toBeInstanceOf(ForbiddenError);

    await service.rename(alice, id, "Renamed");
    const { invitePath } = await service.resetInvite(alice, id);
    expect(invitePath).not.toContain(old);
    expect(await service.invitePreview(bob, old)).toBeNull();
    await expect(service.join({ id: "dave", accountId32: 4 }, old)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await expect(service.removeMember(alice, id, 1)).rejects.toBeInstanceOf(ConflictError);
    const before = (await service.forMember(alice, id)).inviteToken;
    await service.removeMember(alice, id, 3);
    expect(await service.findForMember(carol, id)).toBeNull();
    // The removed member saw the link: it's replaced, so they can't just rejoin.
    await expect(service.join(carol, before)).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.forMember(alice, id)).inviteToken).not.toBe(before);
    expect((await service.forMember(alice, id)).name).toBe("Renamed");

    await service.delete(alice, id);
    expect(await service.findForMember(alice, id)).toBeNull();
  });

  it("hands the group over when the owner leaves, and deletes it when the last one goes", async () => {
    const { service } = setup();
    const { id } = await service.create(alice, "Stack");
    const token = (await service.forMember(alice, id)).inviteToken;
    await service.join(bob, token);
    await service.join(carol, token);

    expect(await service.leave(alice, id)).toEqual({ deleted: false });
    expect((await service.forMember(bob, id)).ownerUserId).toBe("bob");
    await service.leave(carol, id);
    expect(await service.leave(bob, id)).toEqual({ deleted: true });
    expect(await service.findForMember(bob, id)).toBeNull();
  });

  it("account deletion leaves every group: owned ones pass on or are deleted", async () => {
    const { service } = setup();
    const shared = await service.create(alice, "Shared");
    await service.create(alice, "Alone");
    await service.join(bob, (await service.forMember(alice, shared.id)).inviteToken);

    expect(await service.exportMyData({ userId: "alice", accountId32: 1 })).toEqual({
      groups: expect.arrayContaining([expect.objectContaining({ name: "Shared" })]),
    });
    expect(await service.deleteMyData({ userId: "alice", accountId32: 1 })).toEqual({
      groupMemberships: 2,
      groupsDeleted: 1,
    });
    expect(await service.listMine(alice)).toEqual([]);
    expect(await service.listMine(bob)).toEqual([
      { id: shared.id, name: "Shared", isOwner: true, memberCount: 1 },
    ]);
  });
});

describe("GroupPageService", () => {
  const group: Group = {
    id: "a".repeat(24),
    name: "Stack",
    ownerUserId: "alice",
    inviteToken: "t".repeat(24),
    members: [
      { userId: "alice", accountId32: 1, joinedAt: new Date(0) },
      { userId: "bob", accountId32: 2, joinedAt: new Date(1) },
      { userId: "carol", accountId32: 3, joinedAt: new Date(2) },
    ],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const party = (matchId: string): PairClassification => ({
    matchId,
    accountIdA: 1,
    accountIdB: 2,
    relation: "party",
    startedAt: new Date(Date.UTC(2026, 9, 1)),
    radiantWin: true,
    seatA: { side: "radiant", heroId: 1, partyId: 5, partySize: 2 },
    seatB: { side: "radiant", heroId: 2, partyId: 5, partySize: 2 },
    fetchedAt: new Date(),
  });

  it("checks two stale pairs per visit within budget and reads the cache", async () => {
    const repo = new MemoryGroups();
    const calls: Array<[number, number, number]> = [];
    const source: PartySource = {
      sameTeamAmong: async () => [party("1"), party("2")],
      analysePair: async (a, b, opts) => {
        calls.push([a, b, opts.maxNewDetails]);
        // The first pair still has matches to check next time.
        return ok({ pending: a === 1 && b === 2 ? 5 : 0, interrupted: false });
      },
    };
    const now = new Date("2026-10-15T00:00:00Z");
    const service = new GroupPageService({
      repository: repo,
      party: source,
      games: { recentHeroes: async () => [], rankedResults: async () => [] },
      now: () => now,
    });

    const first = await service.party(group);
    expect(calls).toEqual([
      [1, 2, DETAILS_PER_PAIR],
      [1, 3, DETAILS_PER_PAIR],
    ]);
    expect(first.stats.record).toEqual({ games: 2, decided: 2, wins: 2 });
    expect(first).toMatchObject({ pairsTotal: 3, pairsUnchecked: 2, upstreamBusy: false });

    // Next visit: 1–2 continues (still pending), 2–3 gets its first check; 1–3 is fresh.
    calls.length = 0;
    await service.party(group);
    expect(calls.map(([a, b]) => `${a}:${b}`)).toEqual(["1:2", "2:3"]);
  });

  it("checks the visit's pairs in parallel", async () => {
    let inFlight = 0;
    let most = 0;
    const service = new GroupPageService({
      repository: new MemoryGroups(),
      party: {
        sameTeamAmong: async () => [],
        analysePair: async () => {
          most = Math.max(most, ++inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
          return ok({ pending: 0, interrupted: false });
        },
      },
      games: { recentHeroes: async () => [], rankedResults: async () => [] },
    });
    const res = await service.party(group);
    expect(most).toBe(2);
    expect(res).toMatchObject({ pairsUnchecked: 1, upstreamBusy: false });
  });

  it("leaves busy pairs for the next visit and keeps the ones that finished", async () => {
    const repo = new MemoryGroups();
    let calls = 0;
    const service = new GroupPageService({
      repository: repo,
      party: {
        sameTeamAmong: async () => [],
        analysePair: async (a, b) => {
          calls++;
          return a === 1 && b === 2
            ? err({ type: "rate_limited", retryAfterMs: null })
            : ok({ pending: 0, interrupted: false });
        },
      },
      games: { recentHeroes: async () => [], rankedResults: async () => [] },
    });
    const res = await service.party(group);
    expect(calls).toBe(2);
    expect(res).toMatchObject({ upstreamBusy: true, pairsUnchecked: 2 });
    expect(Object.keys(await repo.pairsRefreshedAt(group.id))).toEqual(["1:3"]);
  });

  it("builds who plays what and the weekly board from members' games", async () => {
    const service = new GroupPageService({
      repository: new MemoryGroups(),
      party: {
        sameTeamAmong: async () => [],
        analysePair: async () => ok({ pending: 0, interrupted: false }),
      },
      games: {
        recentHeroes: async (id) =>
          id === 1
            ? [
                { heroId: 8, result: "win" },
                { heroId: 8, result: "loss" },
              ]
            : [],
        rankedResults: async (id) => (id === 2 ? ["win", "win", "loss"] : []),
      },
    });
    const heroes = await service.heroes(group);
    expect(heroes[0]).toEqual({
      accountId32: 1,
      games: 2,
      heroes: [{ heroId: 8, games: 2, wins: 1 }],
    });
    const board = await service.weeklyBoard(group);
    expect(board.rows.map((r) => [r.accountId32, r.wins, r.losses])).toEqual([[2, 2, 1]]);
    expect(board.idle).toEqual([1, 3]);
    expect(board.to.getTime() - board.from.getTime()).toBe(7 * 24 * 3600 * 1000);
  });
});
