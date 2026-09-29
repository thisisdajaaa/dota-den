import type { Collection, Db } from "mongodb";
import { isGapMinutes, type GapMinutes } from "../domain/session";
import type { SessionNote } from "../domain/session-note";
import type { SessionNoteRepository, SessionSettingsRepository } from "../application/ports";

const SCHEMA_VERSION = 1;
export const SESSION_COLLECTIONS = {
  notes: "session_notes",
  settings: "session_settings",
} as const;

interface SessionNoteDoc extends SessionNote {
  schemaVersion: number;
  createdAt: Date;
}

interface SessionSettingsDoc {
  userId: string;
  gapMinutes: number;
  updatedAt: Date;
  schemaVersion: number;
}

export async function ensureSessionIndexes(db: Db): Promise<void> {
  const notes = db.collection(SESSION_COLLECTIONS.notes);
  await Promise.all([
    notes.createIndex({ userId: 1, sessionId: 1 }, { unique: true, name: "uniq_user_session" }),
    notes.createIndex({ userId: 1, updatedAt: -1 }, { name: "by_user_recent" }),
    db
      .collection(SESSION_COLLECTIONS.settings)
      .createIndex({ userId: 1 }, { unique: true, name: "uniq_user" }),
  ]);
}

const PROJECTION = { _id: 0, schemaVersion: 0, createdAt: 0 } as const;

function toNote(d: SessionNoteDoc): SessionNote {
  return {
    userId: d.userId,
    accountId32: d.accountId32,
    sessionId: d.sessionId,
    matchIds: d.matchIds ?? [],
    note: d.note ?? "",
    goal: d.goal ?? "",
    goalMet: d.goalMet ?? null,
    updatedAt: d.updatedAt,
  };
}

function isDuplicateKey(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 11000;
}

export class MongoSessionNoteRepository implements SessionNoteRepository {
  private readonly col: Collection<SessionNoteDoc>;

  constructor(db: Db) {
    this.col = db.collection<SessionNoteDoc>(SESSION_COLLECTIONS.notes);
  }

  async upsert(note: SessionNote): Promise<SessionNote> {
    const write = () =>
      this.col.findOneAndUpdate(
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
    const doc = await this.col.findOne({ userId, sessionId }, { projection: PROJECTION });
    return doc ? toNote(doc) : null;
  }

  async listForSessions(userId: string, sessionIds: readonly string[]): Promise<SessionNote[]> {
    if (sessionIds.length === 0) return [];
    const docs = await this.col
      .find({ userId, sessionId: { $in: [...sessionIds] } }, { projection: PROJECTION })
      .limit(sessionIds.length)
      .toArray();
    return docs.map(toNote);
  }
}

export class MongoSessionSettingsRepository implements SessionSettingsRepository {
  private readonly col: Collection<SessionSettingsDoc>;

  constructor(db: Db) {
    this.col = db.collection<SessionSettingsDoc>(SESSION_COLLECTIONS.settings);
  }

  async getGap(userId: string): Promise<GapMinutes | null> {
    const doc = await this.col.findOne({ userId });
    // A value from an older option list falls back to the default.
    return doc && isGapMinutes(doc.gapMinutes) ? doc.gapMinutes : null;
  }

  async setGap(userId: string, gapMinutes: GapMinutes, now: Date): Promise<void> {
    try {
      await this.col.updateOne(
        { userId },
        { $set: { gapMinutes, updatedAt: now, schemaVersion: SCHEMA_VERSION } },
        { upsert: true },
      );
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      await this.col.updateOne({ userId }, { $set: { gapMinutes, updatedAt: now } });
    }
  }
}
