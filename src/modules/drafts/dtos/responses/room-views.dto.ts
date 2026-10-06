import { seatOf, type DraftRoom, type RoomEvent } from "../../domain/draft-room";
import type { Side } from "../../domain/draft-state";

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

export function roomView(room: DraftRoom, viewerUserId: string | null): RoomView {
  const pub = (c: DraftRoom["captains"][Side]) =>
    c ? { name: c.name, avatarUrl: c.avatarUrl, accountId32: c.accountId32 } : null;
  return {
    id: room.id,
    status: room.status,
    rev: room.rev,
    captains: { radiant: pub(room.captains.radiant), dire: pub(room.captains.dire) },
    state: room.state,
    rematchOf: room.rematchOf,
    rematchId: room.rematchId,
    viewer: {
      signedIn: viewerUserId !== null,
      seat: viewerUserId ? seatOf(room, viewerUserId) : null,
      isHost: viewerUserId !== null && room.hostUserId === viewerUserId,
    },
    serverNow: Date.now(),
  };
}

export function eventView(e: RoomEvent): EventView {
  const draft = e.draft as { type?: string; heroId?: number } | null;
  return {
    sequence: e.sequence,
    kind: e.kind,
    side: e.side,
    actor: e.actor.name,
    type: draft?.type ?? null,
    heroId: typeof draft?.heroId === "number" ? draft.heroId : null,
    at: e.at.toISOString(),
  };
}
