import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GroupsRepository } from "@/modules/groups/repositories/groups.repository";
import { TogetherMatchesRepository } from "@/modules/together/repositories/together.repository";
import type { PairClassification } from "@/modules/together/domain/pair";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let repo: GroupsRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  repo = new GroupsRepository(async () => db);
  await repo.ensureIndexes();
});
afterAll(async () => teardown?.());

const at = (day: number) => new Date(Date.UTC(2026, 9, day));
const owner = { userId: "u1", accountId32: 1, joinedAt: at(1) };

describe("GroupsRepository", () => {
  it("creates, finds by id and token, and lists a member's groups", async () => {
    const g = await repo.create({ name: "Stack", owner, inviteToken: "A".repeat(24), now: at(1) });
    expect(g.id).toMatch(/^[a-f0-9]{24}$/);
    expect((await repo.findById(g.id))?.name).toBe("Stack");
    expect(await repo.findById("not-an-id")).toBeNull();
    expect((await repo.findByInviteToken("A".repeat(24)))?.id).toBe(g.id);
    expect((await repo.listForUser("u1")).map((x) => x.id)).toEqual([g.id]);
    expect(await repo.countForUser("u1")).toBe(1);
    // Tokens are unique.
    await expect(
      repo.create({ name: "Dup", owner, inviteToken: "A".repeat(24), now: at(1) }),
    ).rejects.toThrow();
  });

  it("adds members atomically up to the cap, once each", async () => {
    const g = await repo.create({ name: "Cap", owner, inviteToken: "B".repeat(24), now: at(1) });
    const m = (n: number) => ({ userId: `m${n}`, accountId32: 100 + n, joinedAt: at(2) });
    expect(await repo.addMember(g.id, m(1), 3, at(2))).not.toBeNull();
    expect(await repo.addMember(g.id, m(1), 3, at(2))).toBeNull();
    const results = await Promise.all([2, 3, 4].map((n) => repo.addMember(g.id, m(n), 3, at(2))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repo.findById(g.id))?.members).toHaveLength(3);
  });

  it("removes members, hands over, renames, resets the token and deletes", async () => {
    const g = await repo.create({ name: "Ops", owner, inviteToken: "C".repeat(24), now: at(1) });
    await repo.addMember(g.id, { userId: "u2", accountId32: 2, joinedAt: at(2) }, 10, at(2));
    await repo.setOwner(g.id, "u2", at(3));
    expect(await repo.removeMember(g.id, "u1", at(3))).toBe(true);
    expect(await repo.removeMember(g.id, "u1", at(3))).toBe(false);
    await repo.rename(g.id, "Renamed", at(4));
    await repo.setInviteToken(g.id, "D".repeat(24), at(4));
    expect(await repo.findByInviteToken("C".repeat(24))).toBeNull();
    const after = await repo.findById(g.id);
    expect(after).toMatchObject({
      name: "Renamed",
      ownerUserId: "u2",
      inviteToken: "D".repeat(24),
    });
    expect(after?.members.map((m) => m.userId)).toEqual(["u2"]);

    await repo.markPairsRefreshed(g.id, ["1:2"], at(5));
    expect(await repo.pairsRefreshedAt(g.id)).toEqual({ "1:2": at(5) });

    expect(await repo.delete(g.id)).toBe(true);
    expect(await repo.findById(g.id)).toBeNull();
  });

  it("exports your groups without other members or the invite link", async () => {
    const g = await repo.create({
      name: "Export",
      owner: { userId: "x1", accountId32: 7, joinedAt: at(1) },
      inviteToken: "E".repeat(24),
      now: at(1),
    });
    await repo.addMember(g.id, { userId: "x2", accountId32: 8, joinedAt: at(2) }, 10, at(2));
    const rows = await repo.exportForMember({ userId: "x2", accountId32: 8 });
    expect(rows).toEqual([
      expect.objectContaining({ id: g.id, name: "Export", role: "member", memberCount: 2 }),
    ]);
    expect(JSON.stringify(rows)).not.toContain("E".repeat(24));
    expect(JSON.stringify(rows)).not.toContain("x1");
  });
});

describe("TogetherMatchesRepository.sameTeamAmong", () => {
  it("returns party and unknown-party rows between members only", async () => {
    const together = new TogetherMatchesRepository(async () => db);
    await together.ensureIndexes();
    const row = (
      matchId: string,
      a: number,
      b: number,
      relation: PairClassification["relation"],
    ): PairClassification => ({
      matchId,
      accountIdA: a,
      accountIdB: b,
      relation,
      startedAt: at(1),
      radiantWin: true,
      seatA: null,
      seatB: null,
      fetchedAt: at(1),
    });
    await together.saveMany([
      row("1", 10, 20, "party"),
      row("2", 10, 30, "same_team_unknown"),
      row("3", 10, 20, "opponents"),
      row("4", 10, 99, "party"),
    ]);
    const rows = await together.sameTeamAmong([10, 20, 30]);
    expect(rows.map((r) => r.matchId).sort()).toEqual(["1", "2"]);
    expect(await together.sameTeamAmong([10])).toEqual([]);
  });
});
