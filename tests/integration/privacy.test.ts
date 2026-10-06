import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as annotations from "@/modules/annotations/infrastructure/mongo-annotations";
import * as drafts from "@/modules/drafts/infrastructure/user-data";
import { GoalsRepository } from "@/modules/goals/goals.repository";
import { GoalsService } from "@/modules/goals/goals.service";
import * as identity from "@/modules/identity/infrastructure/user-data";
import * as leaderboards from "@/modules/leaderboards/infrastructure/user-data";
import * as matches from "@/modules/matches/infrastructure/user-data";
import * as mmr from "@/modules/mmr/infrastructure/user-data";
import * as patches from "@/modules/patches/infrastructure/user-data";
import * as players from "@/modules/players/infrastructure/user-data";
import * as sessions from "@/modules/sessions/infrastructure/user-data";
import * as together from "@/modules/together/infrastructure/user-data";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
});
afterAll(async () => teardown?.());

// Goals in the new module anatomy (ADR 0009): the service exports and deletes.
const goalsPart = {
  exportUserData: (_db: Db, owner: { userId: string; accountId32: number }) =>
    new GoalsService({
      repository: new GoalsRepository(async () => db),
      sessions: { rankedSessions: async () => [] },
      mmr: { entryTimes: async () => [] },
    }).exportMyData(owner),
  deleteUserData: (_db: Db, owner: { userId: string; accountId32: number }) =>
    new GoalsService({
      repository: new GoalsRepository(async () => db),
      sessions: { rankedSessions: async () => [] },
      mmr: { entryTimes: async () => [] },
    }).deleteMyData(owner),
};

const PARTS = [
  mmr,
  sessions,
  players,
  patches,
  leaderboards,
  drafts,
  matches,
  together,
  annotations,
  goalsPart,
  identity,
];

async function seed(userId: ObjectId, accountId32: number, friendAccount: number) {
  const u = userId.toHexString();
  await db
    .collection("users")
    .insertOne({ _id: userId, accountId32, steamId64: String(accountId32) });
  await db.collection("auth_sessions").insertOne({ userId: u, tokenHash: `t${u}` });
  await db.collection("mmr_entries").insertOne({ userId: u, accountId32, mmr: 4000 });
  await db.collection("rank_history").insertOne({ accountId32, rankTier: 55 });
  await db.collection("session_notes").insertOne({ userId: u, sessionId: "s" });
  await db.collection("session_settings").insertOne({ userId: u, gapMinutes: 60 });
  await db.collection("player_follows").insertOne({ userId: u, accountId32: friendAccount });
  await db.collection("patch_watchlists").insertOne({ userId: u, heroIds: [1] });
  await db.collection("challenge_attempts").insertOne({ userId: u, type: "last_pick" });
  await db.collection<{ _id: string }>("challenge_streaks").insertOne({ _id: u });
  await db.collection("draft_results").insertOne({ userId: u, score: 70 });
  await new GoalsRepository(async () => db).saveGoals(u, "2026-10-05", [
    { type: "logAfterSessions" },
  ]);
  await db.collection("player_match_facts").insertOne({ accountId32, matchId: `m${accountId32}` });
  await db.collection("match_sync_state").insertOne({ accountId32 });
  await db
    .collection("together_matches")
    .insertOne({ accountIdA: accountId32, accountIdB: friendAccount });
}

describe("deleting your data", () => {
  it("removes everything about you, anonymises shared drafts, and leaves others alone", async () => {
    const me = new ObjectId();
    const other = new ObjectId();
    await seed(me, 111, 222);
    await seed(other, 222, 333);
    // A friend-room draft shared by both captains.
    await db.collection("draft_history").insertOne({
      captains: {
        radiant: { userId: me.toHexString(), accountId32: 111, name: "Me", avatarUrl: "x" },
        dire: { userId: other.toHexString(), accountId32: 222, name: "Friend", avatarUrl: "y" },
      },
      captainUserIds: [me.toHexString(), other.toHexString()],
      captainAccountIds: [111, 222],
    });

    const owner = { userId: me.toHexString(), accountId32: 111 };
    const exported = Object.assign(
      {},
      ...(await Promise.all(PARTS.map((p) => p.exportUserData(db, owner)))),
    );
    expect(exported.mmrEntries).toHaveLength(1);
    expect(exported.friendRoomDrafts).toHaveLength(1);
    expect(exported.weeklyGoals).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("tokenHash");

    for (const p of PARTS) await p.deleteUserData(db, owner);

    // Nothing anywhere still points at me.
    const mine = {
      $or: [
        { _id: me },
        { _id: me.toHexString() as unknown as ObjectId },
        { userId: me.toHexString() },
        { accountId32: 111 },
        { captainUserIds: me.toHexString() },
        { accountIdA: 111 },
        { accountIdB: 111 },
      ],
    };
    for (const name of await db
      .listCollections()
      .map((c) => c.name)
      .toArray()) {
      expect(await db.collection(name).countDocuments(mine), name).toBe(0);
    }
    // The shared draft stays for the friend, without my name.
    const shared = await db.collection("draft_history").findOne({});
    expect(shared?.captains.radiant).toMatchObject({ name: "Deleted player", avatarUrl: null });
    expect(shared?.captainUserIds).toEqual([other.toHexString()]);
    // The other player's data is untouched (their together row with me went with mine).
    expect(await db.collection("users").countDocuments({ _id: other })).toBe(1);
    expect(await db.collection("mmr_entries").countDocuments({ userId: other.toHexString() })).toBe(
      1,
    );
    expect(await db.collection("player_match_facts").countDocuments({ accountId32: 222 })).toBe(1);
  });
});
