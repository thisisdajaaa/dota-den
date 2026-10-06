import type { Db } from "mongodb";
import type { CommitResult, DraftRoomsPort } from "../draft-room.ports";
import type { DraftRoom, RoomEvent } from "../domain/draft-room";

const SCHEMA_VERSION = 1;
/** Rooms expire a day after their last activity (TTL index). Overridable: DRAFT_ROOM_TTL_HOURS. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export const DRAFT_ROOM_COLLECTIONS = { rooms: "draft_rooms", events: "draft_events" } as const;

interface RoomDoc extends Omit<DraftRoom, "id"> {
  _id: string;
  schemaVersion: number;
  expiresAt: Date;
}

interface EventDoc extends RoomEvent {
  schemaVersion: number;
  expiresAt: Date;
}

function toDoc(room: DraftRoom, ttlMs: number): RoomDoc {
  const { id, ...rest } = room;
  return {
    _id: id,
    ...rest,
    schemaVersion: SCHEMA_VERSION,
    expiresAt: new Date(room.lastActivityAt.getTime() + ttlMs),
  };
}

function toRoom({ _id, schemaVersion: _v, expiresAt: _e, ...rest }: RoomDoc): DraftRoom {
  return { id: _id, ...rest };
}

function toEventDoc(e: RoomEvent, ttlMs: number): EventDoc {
  return { ...e, schemaVersion: SCHEMA_VERSION, expiresAt: new Date(e.at.getTime() + ttlMs) };
}

function toEvent({
  schemaVersion: _v,
  expiresAt: _e,
  ...rest
}: EventDoc & { _id?: unknown }): RoomEvent {
  const { _id, ...event } = rest as EventDoc & { _id?: unknown };
  void _id;
  return event;
}

export class DraftRoomsRepository implements DraftRoomsPort {
  /** `ttlMs`: how long a room and its events are kept after the last activity (read on use). */
  constructor(
    private readonly getDb: () => Promise<Db>,
    private readonly opts: { readonly ttlMs?: number } = {},
  ) {}

  private get ttlMs(): number {
    return this.opts.ttlMs ?? ROOM_TTL_MS;
  }

  private async rooms() {
    return (await this.getDb()).collection<RoomDoc>(DRAFT_ROOM_COLLECTIONS.rooms);
  }

  private async events() {
    return (await this.getDb()).collection<EventDoc>(DRAFT_ROOM_COLLECTIONS.events);
  }

  async insert(room: DraftRoom, created: RoomEvent): Promise<void> {
    await (await this.rooms()).insertOne(toDoc(room, this.ttlMs));
    await (await this.events()).insertOne(toEventDoc(created, this.ttlMs));
  }

  async get(roomId: string): Promise<DraftRoom | null> {
    const doc = await (await this.rooms()).findOne({ _id: roomId });
    return doc ? toRoom(doc) : null;
  }

  async commit(expectedRev: number, next: DraftRoom, event: RoomEvent): Promise<CommitResult> {
    // Optimistic concurrency: only the writer that still sees `expectedRev` wins.
    const res = await (
      await this.rooms()
    ).replaceOne({ _id: next.id, rev: expectedRev }, toDoc(next, this.ttlMs));
    if (res.matchedCount !== 1) return "conflict";
    try {
      await (await this.events()).insertOne(toEventDoc(event, this.ttlMs));
    } catch (e) {
      // The room already moved on; a duplicate event can only be a replayed idempotency key.
      if (!(typeof e === "object" && e !== null && "code" in e && e.code === 11000)) throw e;
    }
    return "committed";
  }

  async findByIdempotencyKey(roomId: string, key: string): Promise<RoomEvent | null> {
    const doc = await (await this.events()).findOne({ roomId, idempotencyKey: key });
    return doc ? toEvent(doc) : null;
  }

  async eventsSince(roomId: string, afterSequence: number, limit: number): Promise<RoomEvent[]> {
    const docs = await (
      await this.events()
    )
      .find({ roomId, sequence: { $gt: afterSequence } })
      .sort({ sequence: 1 })
      .limit(limit)
      .toArray();
    return docs.map(toEvent);
  }

  /** Which of these rooms still exist (the rest have expired). */
  async existingIds(roomIds: string[]): Promise<Set<string>> {
    const docs = await (
      await this.rooms()
    )
      .find({ _id: { $in: roomIds } }, { projection: { _id: 1 } })
      .toArray();
    return new Set(docs.map((d) => d._id));
  }

  async countActive(since: Date): Promise<number> {
    return (await this.rooms()).countDocuments({
      status: { $in: ["lobby", "in_progress"] },
      lastActivityAt: { $gte: since },
    });
  }

  async ensureIndexes(): Promise<void> {
    const db = await this.getDb();
    const rooms = db.collection(DRAFT_ROOM_COLLECTIONS.rooms);
    const events = db.collection(DRAFT_ROOM_COLLECTIONS.events);
    await Promise.all([
      rooms.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
      rooms.createIndex({ status: 1, lastActivityAt: -1 }, { name: "by_status_activity" }),
      events.createIndex({ roomId: 1, sequence: 1 }, { unique: true, name: "uniq_room_sequence" }),
      events.createIndex(
        { roomId: 1, idempotencyKey: 1 },
        {
          unique: true,
          name: "uniq_room_idempotency",
          partialFilterExpression: { idempotencyKey: { $type: "string" } },
        },
      ),
      events.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" }),
    ]);
  }
}
