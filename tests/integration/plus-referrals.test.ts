import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Referral } from "@/modules/plus/domain/referral";
import {
  GrantsRepository,
  ReferralsRepository,
} from "@/modules/plus/repositories/referrals.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let referrals: ReferralsRepository;
let grants: GrantsRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  referrals = new ReferralsRepository(async () => db);
  grants = new GrantsRepository(async () => db);
  await referrals.ensureIndexes();
  await grants.ensureIndexes();
});
afterAll(async () => teardown?.());

const NOW = new Date("2026-11-26T12:00:00Z");
const claim = (over: Partial<Referral> = {}): Referral => ({
  friendAccountId32: 22,
  friendUserId: "friend",
  referrerId: "inviter",
  referrerAccountId32: 11,
  code: "abcdefgh",
  claimedAt: NOW,
  status: "pending",
  rewardedAt: null,
  referrerRewarded: false,
  ...over,
});

describe("ReferralsRepository (Mongo)", () => {
  it("keeps one code per player and one owner per code", async () => {
    const code = { code: "abcdefgh", userId: "inviter", accountId32: 11, createdAt: NOW };
    expect(await referrals.saveCode(code)).toBe(true);
    expect(await referrals.saveCode({ ...code, code: "bcdefghj" })).toBe(false);
    expect(await referrals.saveCode({ ...code, userId: "someone" })).toBe(false);
    expect(await referrals.codeOf("inviter")).toBe("abcdefgh");
    expect(await referrals.ownerOf("abcdefgh")).toEqual({ userId: "inviter", accountId32: 11 });
    expect(await referrals.ownerOf("zzzzzzzz")).toBeNull();
  });

  it("records each Steam account's claim once and settles it once", async () => {
    expect(await referrals.claim(claim())).toBe(true);
    expect(await referrals.claim(claim({ referrerId: "other" }))).toBe(false);
    expect(await referrals.claimOf(22)).toMatchObject({ referrerId: "inviter", status: "pending" });
    expect(await referrals.claimOf(99, "friend")).toMatchObject({ friendAccountId32: 22 });
    const update = { status: "rewarded" as const, rewardedAt: NOW, referrerRewarded: true };
    expect(await referrals.settle(22, update)).toBe(true);
    expect(await referrals.settle(22, update)).toBe(false);
    expect(await referrals.byReferrer("inviter")).toHaveLength(1);
    expect(await referrals.counts()).toEqual({ claimed: 1, pending: 0, rewarded: 1 });
  });

  it("exports and deletes a player's codes and claims", async () => {
    const owner = { userId: "inviter", accountId32: 11 };
    expect((await referrals.exportForOwner(owner)).length).toBe(2);
    expect(await referrals.deleteForOwner(owner)).toBe(2);
    expect(await referrals.codeOf("inviter")).toBeNull();
  });
});

describe("GrantsRepository (Mongo)", () => {
  it("gives a grant once and finds the running ones", async () => {
    const week = {
      id: "referral:22:friend",
      userId: "friend",
      accountId32: 22,
      source: "referral" as const,
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + 7 * 86_400_000),
      createdAt: NOW,
    };
    expect(await grants.give(week)).toBe(true);
    expect(await grants.give(week)).toBe(false);
    await grants.give({
      ...week,
      id: "referral:23:friend",
      startsAt: week.endsAt,
      endsAt: new Date(week.endsAt.getTime() + 7 * 86_400_000),
    });
    expect(await grants.forUser("friend")).toHaveLength(2);
    expect(await grants.activeUserIds(NOW)).toEqual(["friend"]);
    expect(await grants.activeUserIds(new Date(NOW.getTime() + 30 * 86_400_000))).toEqual([]);
    expect(await grants.deleteForOwner({ userId: "friend", accountId32: 22 })).toBe(2);
  });
});
