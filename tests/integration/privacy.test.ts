import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnnotationsRepository } from "@/modules/annotations/annotations.repository";
import { AnnotationsService } from "@/modules/annotations/annotations.service";
import type { DataOwner } from "@/common/privacy/user-data";
import * as drafts from "@/modules/drafts/infrastructure/user-data";
import { GoalsRepository } from "@/modules/goals/goals.repository";
import { GoalsService } from "@/modules/goals/goals.service";
import { AuthSessionsRepository } from "@/modules/identity/repositories/auth-sessions.repository";
import { UsersRepository } from "@/modules/identity/repositories/users.repository";
import { UsersService } from "@/modules/identity/services/users.service";
import { ActivityRepository } from "@/modules/leaderboards/repositories/activity.repository";
import { MatchReadRepository } from "@/modules/matches/repositories/matches.repository";
import { MedalHistoryRepository } from "@/modules/mmr/repositories/medal-history.repository";
import { MmrEntriesRepository } from "@/modules/mmr/repositories/mmr-entries.repository";
import { MmrJournalService } from "@/modules/mmr/services/mmr-journal.service";
import { PatchWatchlistsRepository } from "@/modules/patches/repositories/patches.repository";
import { PatchWatchlistService } from "@/modules/patches/services/patch-watchlist.service";
import { FollowsRepository } from "@/modules/players/repositories/follows.repository";
import { FollowService } from "@/modules/players/services/follow.service";
import {
  SessionNotesRepository,
  SessionSettingsRepository,
} from "@/modules/sessions/repositories/sessions.repository";
import { SessionService } from "@/modules/sessions/sessions.service";
import { TogetherMatchesRepository } from "@/modules/together/repositories/together.repository";
import { TogetherService } from "@/modules/together/together.service";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
});
afterAll(async () => teardown?.());

/** A migrated feature's service (ADR 0009), with its repository on the test database. */
const servicePart = (
  make: (getDb: () => Promise<Db>) => {
    exportMyData(o: DataOwner): Promise<object>;
    deleteMyData(o: DataOwner): Promise<object>;
  },
) => ({
  exportUserData: (_db: Db, owner: DataOwner) => make(async () => db).exportMyData(owner),
  deleteUserData: (_db: Db, owner: DataOwner) => make(async () => db).deleteMyData(owner),
});
const goalsPart = servicePart(
  (getDb) =>
    new GoalsService({
      repository: new GoalsRepository(getDb),
      sessions: { rankedSessions: async () => [] },
      mmr: { entryTimes: async () => [] },
    }),
);
const annotationsPart = servicePart(
  (getDb) => new AnnotationsService({ repository: new AnnotationsRepository(getDb) }),
);

const identity = servicePart(
  (getDb) =>
    new UsersService({
      users: new UsersRepository(getDb),
      sessions: new AuthSessionsRepository(getDb),
    }),
);

const sessions = servicePart((getDb) => {
  const notes = new SessionNotesRepository(getDb);
  const settings = new SessionSettingsRepository(getDb);
  return new SessionService({
    matches: { listMatches: async () => [] },
    observations: { list: async () => [] },
    notes,
    settings,
    data: { notes, settings },
  });
});

const players = servicePart((getDb) => {
  const repo = new FollowsRepository(getDb);
  return new FollowService(repo, { data: repo });
});

const together = servicePart((getDb) => {
  const repo = new TogetherMatchesRepository(getDb);
  return new TogetherService({
    finder: { sharedMatches: async () => ({ ok: true, value: [] }) },
    seats: { seats: async () => ({ ok: false, error: { type: "unavailable", cause: "test" } }) },
    repo,
    ownGames: { ownGames: async () => [] },
    data: repo,
  });
});

const leaderboards = servicePart((getDb) => {
  const repo = new ActivityRepository(getDb);
  return {
    exportMyData: (o: DataOwner) => repo.exportForOwner(o),
    deleteMyData: (o: DataOwner) => repo.deleteForOwner(o),
  };
});

const patches = servicePart((getDb) => {
  const repo = new PatchWatchlistsRepository(getDb);
  return new PatchWatchlistService({ watchlists: repo, data: repo });
});

const mmr = servicePart((getDb) => {
  const entries = new MmrEntriesRepository(getDb);
  return new MmrJournalService(entries, undefined, {
    entries,
    medals: new MedalHistoryRepository(getDb),
  });
});

const matches = servicePart((getDb) => {
  const repo = new MatchReadRepository(getDb);
  return {
    exportMyData: (o: DataOwner) => repo.exportForOwner(o),
    deleteMyData: (o: DataOwner) => repo.deleteForOwner(o),
  };
});

const PARTS = [
  mmr,
  sessions,
  players,
  patches,
  leaderboards,
  drafts,
  matches,
  together,
  annotationsPart,
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
