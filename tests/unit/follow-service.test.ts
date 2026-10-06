import { describe, expect, it } from "vitest";
import { FollowService, ownerOf } from "@/modules/players/services/follow.service";
import type { FollowsPort } from "@/modules/players/players.ports";
import type { PlayerFollow } from "@/modules/players/domain/follow";

/** In-memory repository with the same owner scoping as the Mongo one. */
class FakeFollowRepository implements FollowsPort {
  rows: PlayerFollow[] = [];
  async add(f: PlayerFollow) {
    if (this.rows.some((r) => r.userId === f.userId && r.accountId32 === f.accountId32))
      return false;
    this.rows.push(f);
    return true;
  }
  async remove(userId: string, accountId32: number) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.userId === userId && r.accountId32 === accountId32));
    return this.rows.length < before;
  }
  async list(userId: string) {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async count(userId: string) {
    return this.rows.filter((r) => r.userId === userId).length;
  }
  async find(userId: string, accountId32: number) {
    return this.rows.find((r) => r.userId === userId && r.accountId32 === accountId32) ?? null;
  }
}

const alice = { userId: "alice", accountId32: 1000 };
const bob = { userId: "bob", accountId32: 2000 };

function setup(limit?: number) {
  const repo = new FakeFollowRepository();
  let t = Date.parse("2026-09-30T00:00:00Z");
  const service = new FollowService(repo, { now: () => new Date((t += 1000)), limit });
  return { repo, service };
}

describe("FollowService", () => {
  it("follows a player and lists newest first", async () => {
    const { service } = setup();
    const first = await service.follow(alice, 22202);
    expect(first).toMatchObject({
      ok: true,
      value: { created: true, follow: { accountId32: 22202 } },
    });
    await service.follow(alice, 33303);
    expect((await service.list(alice)).map((f) => f.accountId32)).toEqual([33303, 22202]);
    expect(await service.isFollowing(alice, 22202)).toBe(true);
  });

  it("is idempotent: following twice keeps one follow and the original date", async () => {
    const { repo, service } = setup();
    const first = await service.follow(alice, 22202);
    const again = await service.follow(alice, 22202);
    expect(again.ok && again.value.created).toBe(false);
    expect(again.ok && first.ok && again.value.follow.createdAt).toEqual(
      first.ok && first.value.follow.createdAt,
    );
    expect(repo.rows).toHaveLength(1);
  });

  it("enforces the per-user limit, but re-following at the limit still succeeds", async () => {
    const { service } = setup(3);
    for (const id of [1, 2, 3]) expect((await service.follow(alice, id)).ok).toBe(true);
    expect(await service.follow(alice, 4)).toEqual({
      ok: false,
      error: { type: "limit_reached", limit: 3 },
    });
    expect((await service.follow(alice, 2)).ok).toBe(true);
    // Another user's list is unaffected by alice's limit.
    expect((await service.follow(bob, 4)).ok).toBe(true);
  });

  it("defaults to a limit of 100", async () => {
    const { service } = setup();
    for (let id = 1; id <= 100; id++) await service.follow(alice, id);
    expect(await service.follow(alice, 101)).toEqual({
      ok: false,
      error: { type: "limit_reached", limit: 100 },
    });
  });

  it("rejects following yourself and invalid account ids", async () => {
    const { service } = setup();
    expect(await service.follow(alice, alice.accountId32)).toEqual({
      ok: false,
      error: { type: "self" },
    });
    for (const bad of [0, -5, 1.5, 4294967296]) {
      expect(await service.follow(alice, bad)).toEqual({
        ok: false,
        error: { type: "invalid_account" },
      });
    }
  });

  it("unfollows idempotently", async () => {
    const { service } = setup();
    await service.follow(alice, 22202);
    expect(await service.unfollow(alice, 22202)).toBe(true);
    expect(await service.unfollow(alice, 22202)).toBe(false);
    expect(await service.list(alice)).toEqual([]);
  });

  it("scopes every command to the owner", async () => {
    const { service } = setup();
    await service.follow(alice, 22202);
    await service.follow(bob, 33303);

    // Bob can't remove or see alice's follow.
    expect(await service.unfollow(bob, 22202)).toBe(false);
    expect(await service.isFollowing(bob, 22202)).toBe(false);
    expect((await service.list(bob)).map((f) => f.accountId32)).toEqual([33303]);
    expect((await service.list(alice)).map((f) => f.accountId32)).toEqual([22202]);
  });

  it("ownerOf maps a signed-in user", () => {
    expect(ownerOf({ id: "u1", accountId32: 5 })).toEqual({ userId: "u1", accountId32: 5 });
  });
});
