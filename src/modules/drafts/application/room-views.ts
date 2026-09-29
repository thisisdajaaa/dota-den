import type { DraftRoom, RoomEvent } from "../domain/draft-room";
import type { Side } from "../domain/draft-state";

/** What any viewer may see. User ids stay server-side; the viewer gets their own role. */
export interface RoomView {
  id: string;
  status: DraftRoom["status"];
  rev: number;
  captains: Record<Side, { name: string; avatarUrl: string | null; accountId32: number } | null>;
  state: DraftRoom["state"];
  rematchOf: string | null;
  rematchId: string | null;
  viewer: { signedIn: boolean; seat: Side | null; isHost: boolean };
  /** Server clock (ms) so clients can show the authoritative timer without drift. */
  serverNow: number;
}

export interface EventView {
  sequence: number;
  kind: RoomEvent["kind"];
  side: Side | null;
  actor: string;
  type: string | null;
  heroId: number | null;
  at: string;
}
