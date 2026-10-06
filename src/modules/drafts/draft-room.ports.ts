import type { DraftRoom, RoomEvent } from "./domain/draft-room";

export type CommitResult = "committed" | "conflict";

export interface DraftRoomsPort {
  insert(room: DraftRoom, created: RoomEvent): Promise<void>;
  get(roomId: string): Promise<DraftRoom | null>;
  /**
   * Replace the room iff its stored `rev` still equals `expectedRev`, then append `event`
   * (whose sequence = next.rev). Returns "conflict" when someone else changed it first.
   */
  commit(expectedRev: number, next: DraftRoom, event: RoomEvent): Promise<CommitResult>;
  /** An already-applied action with this idempotency key, if any. */
  findByIdempotencyKey(roomId: string, key: string): Promise<RoomEvent | null>;
  eventsSince(roomId: string, afterSequence: number, limit: number): Promise<RoomEvent[]>;
  /** Rooms in lobby or in progress with activity since `since` (abuse cap). */
  countActive(since: Date): Promise<number>;
}
