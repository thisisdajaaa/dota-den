import "server-only";
import type { Db } from "mongodb";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { ReplaySummary } from "../domain/replay-summary";
import {
  REPLAY_READS_COLLECTION,
  REPLAY_READS_KEEP_S,
  replayReadId,
  type ReplayReadDocument,
} from "../report.model";
import type {
  CoachNotesPort,
  PeriodReadsPort,
  ReplayReadsPort,
  StoredCoachNote,
  StoredPeriodRead,
} from "../report.ports";

/** Lane outcomes and objectives per parsed match and player, so each replay is read once. */
export class ReplayReadsRepository implements ReplayReadsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<ReplayReadDocument>(REPLAY_READS_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await col.createIndex(
      { computedAt: 1 },
      { expireAfterSeconds: REPLAY_READS_KEEP_S, name: "ttl_365d" },
    );
    await col.createIndex({ accountId32: 1 }, { name: "by_account" });
  }

  /** Saved summaries for one player, by match id. */
  async find(accountId32: number, matchIds: readonly string[]) {
    const docs = await (
      await this.col()
    )
      .find({ _id: { $in: matchIds.map((m) => replayReadId(m, accountId32)) } })
      .toArray();
    return new Map(
      docs.map(({ _id, accountId32: _a, computedAt: _c, ...s }) => [_id.split(":")[0], s]),
    );
  }

  async save(matchId: string, accountId32: number, s: ReplaySummary): Promise<void> {
    await (
      await this.col()
    ).updateOne(
      { _id: replayReadId(matchId, accountId32) },
      { $set: { ...s, accountId32, computedAt: new Date() } },
      { upsert: true },
    );
  }

  /** Summaries of public matches, kept per account: counted in the export, removed with it. */
  async countForOwner(owner: DataOwner): Promise<number> {
    return (await this.col()).countDocuments({ accountId32: owner.accountId32 });
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ accountId32: owner.accountId32 })).deletedCount;
  }
}

interface PeriodReadDoc extends Omit<StoredPeriodRead, "key"> {
  _id: string;
  expiresAt: Date;
}

/** AI reads of report periods, kept 30 days (a later read of the same period is free). */
const PERIOD_READ_TTL_MS = 30 * 24 * 3_600_000;

export class PeriodReadsRepository implements PeriodReadsPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<PeriodReadDoc>("report_ai_reads");
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      col.createIndex({ userId: 1 }, { name: "by_user" }),
    ]);
  }

  async get(key: string): Promise<StoredPeriodRead | null> {
    const doc = await (await this.col()).findOne({ _id: key });
    if (!doc) return null;
    const { _id, expiresAt: _e, ...rest } = doc;
    return { key: _id, ...rest };
  }

  async save(read: StoredPeriodRead): Promise<void> {
    const { key, ...rest } = read;
    await (
      await this.col()
    ).replaceOne(
      { _id: key },
      { ...rest, expiresAt: new Date(read.createdAt.getTime() + PERIOD_READ_TTL_MS) },
      { upsert: true },
    );
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}

interface CoachNoteDoc extends Omit<StoredCoachNote, "id"> {
  _id: string;
  expiresAt: Date;
}

/** Weekly coach notes, kept a year (the report page can show any past week's note). */
const COACH_NOTE_TTL_MS = 365 * 24 * 3_600_000;

export class CoachNotesRepository implements CoachNotesPort {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<CoachNoteDoc>("report_weekly_coach_notes");
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.col();
    await Promise.all([
      col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      col.createIndex({ userId: 1, week: -1 }, { name: "by_user_week" }),
    ]);
  }

  private static fromDoc({ _id, expiresAt: _e, ...rest }: CoachNoteDoc): StoredCoachNote {
    return { id: _id, ...rest };
  }

  async get(id: string): Promise<StoredCoachNote | null> {
    const doc = await (await this.col()).findOne({ _id: id });
    return doc ? CoachNotesRepository.fromDoc(doc) : null;
  }

  /** Inserts only when missing, so two writers racing keep the first note. */
  async saveOnce(note: StoredCoachNote): Promise<StoredCoachNote> {
    const { id, ...rest } = note;
    const col = await this.col();
    await col.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          ...rest,
          expiresAt: new Date(note.createdAt.getTime() + COACH_NOTE_TTL_MS),
        },
      },
      { upsert: true },
    );
    const kept = await col.findOne({ _id: id });
    return kept ? CoachNotesRepository.fromDoc(kept) : note;
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
