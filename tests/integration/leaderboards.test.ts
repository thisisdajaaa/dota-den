import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DraftHistoryRecord } from "@/modules/drafts/domain/draft-history";
import {
  ensureDraftHistoryIndexes,
  MongoDraftHistoryRepository,
} from "@/modules/drafts/infrastructure/mongo-draft-history";
import type { ChallengeAttempt, DraftResult } from "@/modules/leaderboards/domain/activity";
import {
  ensureLeaderboardIndexes,
  LEADERBOARD_COLLECTIONS,
  MongoActivityRepository,
} from "@/modules/leaderboards/infrastructure/mongo-activity-repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensureLeaderboardIndexes(db);
  await ensureDraftHistoryIndexes(db);
});
afterAll(async () => teardown?.());

const WEEK = new Date("2026-09-28T00:00:00Z");
const at = (iso: string) => new Date(iso);

const attempt = (over: Partial<ChallengeAttempt>): ChallengeAttempt => ({
  userId: "u1",
  type: "last_pick",
  seed: "abcd1234",
  grade: "good",
  correct: true,
  at: at("2026-09-30T10:00:00Z"),
  ...over,
});

const draft = (over: Partial<DraftResult>): DraftResult => ({
  userId: "u1",
  mode: "ai",
  side: "radiant",
  score: 60,
  grade: "B",
  snapshotHash: "h1",
  rulesetId: "cm-2026",
  rulesetVersion: 1,
  completedAt: at("2026-09-30T10:00:00Z"),
  ...over,
});

describe("MongoActivityRepository", () => {
  it("keeps one answer per player and puzzle, even when sent concurrently", async () => {
    const repo = new MongoActivityRepository(db);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        repo.insertAttempt(attempt({ userId: "dup", grade: i ? "risky" : "good" })),
      ),
    );
    expect(results.filter((r) => r === "inserted")).toHaveLength(1);
    expect(
      await db.collection(LEADERBOARD_COLLECTIONS.attempts).countDocuments({ userId: "dup" }),
    ).toBe(1);
    // Another puzzle, or another player on the same puzzle, still counts.
    expect(await repo.insertAttempt(attempt({ userId: "dup", seed: "other123" }))).toBe("inserted");
    expect(await repo.insertAttempt(attempt({ userId: "dup2" }))).toBe("inserted");
  });

  it("keeps one copy of the same finished draft per player", async () => {
    const repo = new MongoActivityRepository(db);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => repo.insertDraft(draft({ userId: "d1" }))),
    );
    expect(results.filter((r) => r === "inserted")).toHaveLength(1);
    expect(await repo.insertDraft(draft({ userId: "d1", snapshotHash: "h2" }))).toBe("inserted");
    expect(await repo.insertDraft(draft({ userId: "d2" }))).toBe("inserted");
    expect(
      await db.collection(LEADERBOARD_COLLECTIONS.drafts).countDocuments({ userId: "d1" }),
    ).toBe(2);
  });

  it("the unique indexes reject a duplicate written around the repository", async () => {
    const attempts = db.collection(LEADERBOARD_COLLECTIONS.attempts);
    await expect(
      attempts.insertOne({ ...attempt({ userId: "dup" }), _id: "another-id" as never }),
    ).rejects.toMatchObject({ code: 11000 });
    const drafts = db.collection(LEADERBOARD_COLLECTIONS.drafts);
    await expect(
      drafts.insertOne({ ...draft({ userId: "d1" }), _id: "another-id" as never }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("keeps the streak: extends on correct, resets on a miss, never loses the best", async () => {
    const repo = new MongoActivityRepository(db);
    expect(await repo.streakOf("s1")).toEqual({ current: 0, best: 0 });
    const now = new Date();
    await repo.applyToStreak("s1", true, now);
    await repo.applyToStreak("s1", true, now);
    expect(await repo.applyToStreak("s1", false, now)).toEqual({ current: 0, best: 2 });
    expect(await repo.applyToStreak("s1", true, now)).toEqual({ current: 1, best: 2 });
    // Concurrent correct answers all count.
    await Promise.all(Array.from({ length: 5 }, () => repo.applyToStreak("s2", true, now)));
    expect(await repo.streakOf("s2")).toEqual({ current: 5, best: 5 });
  });

  it("totals challenges by player and period, with the best streak in order", async () => {
    const repo = new MongoActivityRepository(db);
    const seq: Array<[string, boolean]> = [
      ["2026-09-20T10:00:00Z", true], // last week
      ["2026-09-21T10:00:00Z", true], // last week
      ["2026-09-28T10:00:00Z", false],
      ["2026-09-29T10:00:00Z", true],
      ["2026-09-30T10:00:00Z", true],
    ];
    for (const [i, [iso, correct]] of seq.entries()) {
      await repo.insertAttempt(
        attempt({
          userId: "t1",
          seed: `seed${i}xx`,
          correct,
          grade: correct ? "good" : "risky",
          at: at(iso),
        }),
      );
    }
    await repo.insertAttempt(attempt({ userId: "t2", seed: "zzzz0000" }));

    const all = await repo.challengeTotals({ since: null, userIds: ["t1"] });
    expect(all).toEqual([{ userId: "t1", answered: 5, correct: 4, bestStreak: 2 }]);
    const week = await repo.challengeTotals({ since: WEEK, userIds: ["t1", "t2"] });
    expect(week.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: "t1", answered: 3, correct: 2, bestStreak: 2 },
      { userId: "t2", answered: 1, correct: 1, bestStreak: 1 },
    ]);
  });

  it("totals drafts with the average and best score (and the best draft's grade)", async () => {
    const repo = new MongoActivityRepository(db);
    await repo.insertDraft(draft({ userId: "p1", snapshotHash: "a", score: 40, grade: "C" }));
    await repo.insertDraft(draft({ userId: "p1", snapshotHash: "b", score: 80, grade: "A" }));
    await repo.insertDraft(
      draft({
        userId: "p1",
        snapshotHash: "c",
        mode: "practice",
        side: null,
        score: null,
        grade: null,
      }),
    );
    await repo.insertDraft(
      draft({
        userId: "p1",
        snapshotHash: "d",
        score: 99,
        completedAt: at("2026-09-01T00:00:00Z"),
      }),
    );
    await repo.insertDraft(
      draft({
        userId: "p2",
        snapshotHash: "a",
        mode: "practice",
        side: null,
        score: null,
        grade: null,
      }),
    );

    const week = await repo.draftTotals({ since: WEEK, userIds: ["p1", "p2"] });
    expect(week.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: "p1", drafts: 3, scored: 2, scoreSum: 120, bestScore: 80, bestGrade: "A" },
      { userId: "p2", drafts: 1, scored: 0, scoreSum: 0, bestScore: null, bestGrade: null },
    ]);
    const all = await repo.draftTotals({ since: null, userIds: ["p1"] });
    expect(all[0]).toMatchObject({ drafts: 4, bestScore: 99 });
  });
});

describe("room draft totals from draft history", () => {
  const record = (
    roomId: string,
    radiant: string,
    dire: string,
    winner: "radiant" | "dire" | "not_played" | null,
    completedAt = at("2026-09-30T10:00:00Z"),
  ): DraftHistoryRecord => {
    const captain = (userId: string) => ({
      userId,
      accountId32: Number(userId.replace(/\D/g, "")),
      name: userId,
      avatarUrl: null,
    });
    return {
      roomId,
      completedAt,
      rulesetId: "practice-simple",
      rulesetVersion: 1,
      firstSide: "radiant",
      captains: { radiant: captain(radiant), dire: captain(dire) },
      sides: { radiant: { picks: [], bans: [] }, dire: { picks: [], bans: [] } },
      snapshot: "x",
      rematchOf: null,
      chainId: roomId,
      result: winner
        ? { winner, setBy: { userId: radiant, name: radiant }, setAt: completedAt }
        : null,
    };
  };

  it("counts drafts per captain and only self-reported winners as wins or losses", async () => {
    const repo = new MongoDraftHistoryRepository(db);
    await repo.insertOnce(record("room0001", "c1", "c2", "radiant"));
    await repo.insertOnce(record("room0002", "c2", "c1", "radiant"));
    await repo.insertOnce(record("room0003", "c1", "c3", null));
    await repo.insertOnce(record("room0004", "c1", "c2", "not_played"));
    await repo.insertOnce(record("room0005", "c1", "c2", "dire", at("2026-09-01T10:00:00Z")));

    const all = await repo.captainTotals({ since: null, userIds: ["c1", "c2"] });
    expect(all.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: "c1", drafts: 5, wins: 1, losses: 2 },
      { userId: "c2", drafts: 4, wins: 2, losses: 1 },
    ]);
    const week = await repo.captainTotals({ since: WEEK, userIds: null });
    expect(week.sort((a, b) => a.userId.localeCompare(b.userId))).toEqual([
      { userId: "c1", drafts: 4, wins: 1, losses: 1 },
      { userId: "c2", drafts: 3, wins: 1, losses: 1 },
      { userId: "c3", drafts: 1, wins: 0, losses: 0 },
    ]);
  });
});
