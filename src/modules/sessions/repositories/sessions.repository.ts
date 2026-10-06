import "server-only";
import { forExport, type DataOwner } from "@/common/privacy/user-data";
import type { Db } from "mongodb";
import { isGapMinutes, type GapMinutes } from "../domain/session";
import type { SessionNote } from "../domain/session-note";
import {
  SESSION_COLLECTIONS,
  SESSIONS_SCHEMA_VERSION as SCHEMA_VERSION,
  type SessionNoteDoc,
  type SessionSettingsDoc,
} from "../sessions.model";
import type { PersonalDataStore, SessionNotesPort, SessionSettingsPort } from "../sessions.ports";

const PROJECTION = { _id: 0, schemaVersion: 0, createdAt: 0 } as const;

function toNote(d: SessionNoteDoc): SessionNote {
  return {
    userId: d.userId,
    accountId32: d.accountId32,
    sessionId: d.sessionId,
    matchIds: d.matchIds ?? [],
    sessionStartedAt: d.sessionStartedAt,
    note: d.note ?? "",
    goal: d.goal ?? "",
    goalMet: d.goalMet ?? null,
    updatedAt: d.updatedAt,
  };
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

export class SessionNotesRepository implements SessionNotesPort, PersonalDataStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<SessionNoteDoc>(SESSION_COLLECTIONS.notes);
  }

  async upsert(note: SessionNote): Promise<SessionNote> {
    const col = await this.col();
    const write = () =>
      col.findOneAndUpdate(
        { userId: note.userId, sessionId: note.sessionId },
        {
          $set: { ...note, schemaVersion: SCHEMA_VERSION },
          $setOnInsert: { createdAt: note.updatedAt },
        },
        { upsert: true, returnDocument: "after", projection: PROJECTION },
      );
    let doc: SessionNoteDoc | null;
    try {
      doc = await write();
    } catch (e) {
      // Two concurrent first saves: the unique index lets one insert; retry as an update.
      if (!isDuplicateKey(e)) throw e;
      doc = await write();
    }
    if (!doc) throw new Error("session note upsert returned no document");
    return toNote(doc);
  }

  async get(userId: string, sessionId: string): Promise<SessionNote | null> {
    const doc = await (await this.col()).findOne({ userId, sessionId }, { projection: PROJECTION });
    return doc ? toNote(doc) : null;
  }

  async listForSessions(userId: string, sessionIds: readonly string[]): Promise<SessionNote[]> {
    if (sessionIds.length === 0) return [];
    const docs = await (
      await this.col()
    )
      .find({ userId, sessionId: { $in: [...sessionIds] } }, { projection: PROJECTION })
      .limit(sessionIds.length)
      .toArray();
    return docs.map(toNote);
  }

  async ensureIndexes(): Promise<void> {
    const notes = await this.col();
    await Promise.all([
      notes.createIndex({ userId: 1, sessionId: 1 }, { unique: true, name: "uniq_user_session" }),
      notes.createIndex({ userId: 1, updatedAt: -1 }, { name: "by_user_recent" }),
    ]);
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }

  async listRecent(userId: string, accountId32: number, limit: number): Promise<SessionNote[]> {
    // Served by the (userId, updatedAt) index; the account filter is applied on those rows.
    const docs = await (
      await this.col()
    )
      .find({ userId, accountId32 }, { projection: PROJECTION })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map(toNote);
  }
}

export class SessionSettingsRepository implements SessionSettingsPort, PersonalDataStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async col() {
    return (await this.getDb()).collection<SessionSettingsDoc>(SESSION_COLLECTIONS.settings);
  }

  async getGap(userId: string): Promise<GapMinutes | null> {
    const doc = await (await this.col()).findOne({ userId });
    // A value from an older option list falls back to the default.
    return doc && isGapMinutes(doc.gapMinutes) ? doc.gapMinutes : null;
  }

  async setGap(userId: string, gapMinutes: GapMinutes, now: Date): Promise<void> {
    try {
      await (
        await this.col()
      ).updateOne(
        { userId },
        { $set: { gapMinutes, updatedAt: now, schemaVersion: SCHEMA_VERSION } },
        { upsert: true },
      );
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      await (await this.col()).updateOne({ userId }, { $set: { gapMinutes, updatedAt: now } });
    }
  }

  async ensureIndexes(): Promise<void> {
    await (await this.col()).createIndex({ userId: 1 }, { unique: true, name: "uniq_user" });
  }

  async exportForOwner(owner: DataOwner) {
    return forExport(await (await this.col()).find({ userId: owner.userId }).toArray());
  }

  async deleteForOwner(owner: DataOwner): Promise<number> {
    return (await (await this.col()).deleteMany({ userId: owner.userId })).deletedCount;
  }
}
