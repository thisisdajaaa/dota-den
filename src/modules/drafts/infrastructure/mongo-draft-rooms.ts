import type { Collection, Db } from "mongodb";
import type { CommitResult, DraftRoomRepository } from "../application/draft-room-ports";
import type { DraftRoom, RoomEvent } from "../domain/draft-room";

const SCHEMA_VERSION = 1;
/** Rooms expire a day after their last activity (TTL index). */
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

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

export async function ensureDraftRoomIndexes(db: Db): Promise<void> {
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

function toDoc(room: DraftRoom): RoomDoc {
  const { id, ...rest } = room;
  return {
    _id: id,
    ...rest,
    schemaVersion: SCHEMA_VERSION,
    expiresAt: new Date(room.lastActivityAt.getTime() + ROOM_TTL_MS),
  };
}

function toRoom({ _id, schemaVersion: _v, expiresAt: _e, ...rest }: RoomDoc): DraftRoom {
  return { id: _id, ...rest };
}

function toEventDoc(e: RoomEvent): EventDoc {
  return { ...e, schemaVersion: SCHEMA_VERSION, expiresAt: new Date(e.at.getTime() + ROOM_TTL_MS) };
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

export class MongoDraftRoomRepository implements DraftRoomRepository {
  private readonly rooms: Collection<RoomDoc>;
  private readonly events: Collection<EventDoc>;

  constructor(db: Db) {
    this.rooms = db.collection<RoomDoc>(DRAFT_ROOM_COLLECTIONS.rooms);
    this.events = db.collection<EventDoc>(DRAFT_ROOM_COLLECTIONS.events);
  }

  async insert(room: DraftRoom, created: RoomEvent): Promise<void> {
    await this.rooms.insertOne(toDoc(room));
    await this.events.insertOne(toEventDoc(created));
  }

  async get(roomId: string): Promise<DraftRoom | null> {
    const doc = await this.rooms.findOne({ _id: roomId });
    return doc ? toRoom(doc) : null;
  }

  async commit(expectedRev: number, next: DraftRoom, event: RoomEvent): Promise<CommitResult> {
    // Optimistic concurrency: only the writer that still sees `expectedRev` wins.
    const res = await this.rooms.replaceOne({ _id: next.id, rev: expectedRev }, toDoc(next));
    if (res.matchedCount !== 1) return "conflict";
    try {
      await this.events.insertOne(toEventDoc(event));
    } catch (e) {
      // The room already moved on; a duplicate event can only be a replayed idempotency key.
      if (!(typeof e === "object" && e !== null && "code" in e && e.code === 11000)) throw e;
    }
    return "committed";
  }

  async findByIdempotencyKey(roomId: string, key: string): Promise<RoomEvent | null> {
    const doc = await this.events.findOne({ roomId, idempotencyKey: key });
    return doc ? toEvent(doc) : null;
  }

  async eventsSince(roomId: string, afterSequence: number, limit: number): Promise<RoomEvent[]> {
    const docs = await this.events
      .find({ roomId, sequence: { $gt: afterSequence } })
      .sort({ sequence: 1 })
      .limit(limit)
      .toArray();
    return docs.map(toEvent);
  }

  async countActive(since: Date): Promise<number> {
    return this.rooms.countDocuments({
      status: { $in: ["lobby", "in_progress"] },
      lastActivityAt: { $gte: since },
    });
  }
}
