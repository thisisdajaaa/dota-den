import type { Collection, Db, Document, Filter } from "mongodb";
import type { ActivityRepository, TotalsQuery } from "../application/ports";
import {
  NO_STREAK,
  type ChallengeAttempt,
  type ChallengeStreak,
  type DraftResult,
} from "../domain/activity";
import type { ChallengeTotals, DraftTotals } from "../domain/ranking";

const SCHEMA_VERSION = 1;

export const LEADERBOARD_COLLECTIONS = {
  attempts: "challenge_attempts",
  streaks: "challenge_streaks",
  drafts: "draft_results",
} as const;

interface AttemptDoc extends ChallengeAttempt {
  /** `user:type:seed`, so uniqueness holds even before `ensureLeaderboardIndexes` runs. */
  _id: string;
  schemaVersion: number;
}

interface StreakDoc {
  /** The user id: one streak per player. */
  _id: string;
  schemaVersion: number;
  current: number;
  best: number;
  updatedAt: Date;
}

interface DraftDoc extends DraftResult {
  /** `user:snapshotHash`, so uniqueness holds even before `ensureLeaderboardIndexes` runs. */
  _id: string;
  schemaVersion: number;
}

export async function ensureLeaderboardIndexes(db: Db): Promise<void> {
  const attempts = db.collection(LEADERBOARD_COLLECTIONS.attempts);
  const drafts = db.collection(LEADERBOARD_COLLECTIONS.drafts);
  await Promise.all([
    // The first answer to a puzzle is the one that counts.
    attempts.createIndex(
      { userId: 1, type: 1, seed: 1 },
      { unique: true, name: "uniq_user_puzzle" },
    ),
    attempts.createIndex({ at: 1 }, { name: "by_at" }),
    attempts.createIndex({ userId: 1, at: 1 }, { name: "by_user_at" }),
    // The same finished draft counts once per player.
    drafts.createIndex(
      { userId: 1, snapshotHash: 1 },
      { unique: true, name: "uniq_user_snapshot" },
    ),
    drafts.createIndex({ completedAt: 1 }, { name: "by_completedAt" }),
    drafts.createIndex({ userId: 1, completedAt: 1 }, { name: "by_user_completedAt" }),
  ]);
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

function totalsMatch(query: TotalsQuery, dateField: string): Filter<Document> {
  const match: Filter<Document> = {};
  if (query.since) match[dateField] = { $gte: query.since };
  if (query.userIds) match.userId = { $in: [...query.userIds] };
  return match;
}

export class MongoActivityRepository implements ActivityRepository {
  private readonly attempts: Collection<AttemptDoc>;
  private readonly streaks: Collection<StreakDoc>;
  private readonly drafts: Collection<DraftDoc>;

  constructor(db: Db) {
    this.attempts = db.collection<AttemptDoc>(LEADERBOARD_COLLECTIONS.attempts);
    this.streaks = db.collection<StreakDoc>(LEADERBOARD_COLLECTIONS.streaks);
    this.drafts = db.collection<DraftDoc>(LEADERBOARD_COLLECTIONS.drafts);
  }

  async insertAttempt(attempt: ChallengeAttempt): Promise<"inserted" | "duplicate"> {
    try {
      await this.attempts.insertOne({
        _id: `${attempt.userId}:${attempt.type}:${attempt.seed}`,
        ...attempt,
        schemaVersion: SCHEMA_VERSION,
      });
      return "inserted";
    } catch (e) {
      if (isDuplicateKey(e)) return "duplicate";
      throw e;
    }
  }

  async applyToStreak(userId: string, correct: boolean, at: Date): Promise<ChallengeStreak> {
    // One atomic pipeline update, so concurrent answers can't lose an increment.
    const current = correct ? { $add: [{ $ifNull: ["$current", 0] }, 1] } : 0;
    const update = () =>
      this.streaks.findOneAndUpdate(
        { _id: userId },
        [
          {
            $set: {
              schemaVersion: SCHEMA_VERSION,
              current,
              updatedAt: at,
            },
          },
          { $set: { best: { $max: [{ $ifNull: ["$best", 0] }, "$current"] } } },
        ],
        { upsert: true, returnDocument: "after" },
      );
    let doc: StreakDoc | null;
    try {
      doc = await update();
    } catch (e) {
      // Two first-ever answers at once: one upsert inserts, the other retries as an update.
      if (!isDuplicateKey(e)) throw e;
      doc = await update();
    }
    return doc ? { current: doc.current, best: doc.best } : NO_STREAK;
  }

  async streakOf(userId: string): Promise<ChallengeStreak> {
    const doc = await this.streaks.findOne({ _id: userId });
    return doc ? { current: doc.current, best: doc.best } : NO_STREAK;
  }

  async insertDraft(result: DraftResult): Promise<"inserted" | "duplicate"> {
    try {
      await this.drafts.insertOne({
        _id: `${result.userId}:${result.snapshotHash}`,
        ...result,
        schemaVersion: SCHEMA_VERSION,
      });
      return "inserted";
    } catch (e) {
      if (isDuplicateKey(e)) return "duplicate";
      throw e;
    }
  }

  async draftTotals(query: TotalsQuery): Promise<DraftTotals[]> {
    return this.drafts
      .aggregate<DraftTotals>([
        { $match: totalsMatch(query, "completedAt") },
        // Best score first (numbers sort above null descending), so $first is the best draft.
        { $sort: { userId: 1, score: -1, completedAt: 1 } },
        {
          $group: {
            _id: "$userId",
            drafts: { $sum: 1 },
            scored: { $sum: { $cond: [{ $isNumber: "$score" }, 1, 0] } },
            scoreSum: { $sum: { $cond: [{ $isNumber: "$score" }, "$score", 0] } },
            // $max ignores nulls; a group with no score gives null.
            bestScore: { $max: "$score" },
            bestGrade: { $first: { $ifNull: ["$grade", null] } },
          },
        },
        {
          $project: {
            _id: 0,
            userId: "$_id",
            drafts: 1,
            scored: 1,
            scoreSum: 1,
            bestScore: { $ifNull: ["$bestScore", null] },
            bestGrade: { $ifNull: ["$bestGrade", null] },
          },
        },
      ])
      .toArray();
  }

  async challengeTotals(query: TotalsQuery): Promise<ChallengeTotals[]> {
    return this.attempts
      .aggregate<ChallengeTotals>(
        [
          { $match: totalsMatch(query, "at") },
          // Answers in the order they were given, so the streak is replayed in order.
          { $sort: { userId: 1, at: 1, _id: 1 } },
          {
            $group: {
              _id: "$userId",
              answered: { $sum: 1 },
              correct: { $sum: { $cond: ["$correct", 1, 0] } },
              sequence: { $push: "$correct" },
            },
          },
          {
            $project: {
              _id: 0,
              userId: "$_id",
              answered: 1,
              correct: 1,
              // The streak rule (see domain/activity.ts) over the answers in the period.
              bestStreak: {
                $let: {
                  vars: {
                    run: {
                      $reduce: {
                        input: "$sequence",
                        initialValue: { current: 0, best: 0 },
                        in: {
                          $let: {
                            vars: {
                              next: {
                                $cond: ["$$this", { $add: ["$$value.current", 1] }, 0],
                              },
                            },
                            in: {
                              current: "$$next",
                              best: { $max: ["$$value.best", "$$next"] },
                            },
                          },
                        },
                      },
                    },
                  },
                  in: "$$run.best",
                },
              },
            },
          },
        ],
        { allowDiskUse: true },
      )
      .toArray();
  }
}
