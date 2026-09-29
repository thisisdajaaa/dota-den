import type { DraftEvent, DraftState, Side } from "./draft-state";

/**
 * A multiplayer draft room (spec §2.4, ADR 0003). The room document is the single source of
 * truth; every accepted change bumps `rev`, and an append-only event log records it.
 */
export type RoomStatus = "lobby" | "in_progress" | "completed";

export interface RoomCaptain {
  userId: string;
  accountId32: number;
  name: string;
  avatarUrl: string | null;
}

export interface DraftRoom {
  id: string;
  hostUserId: string;
  captains: Record<Side, RoomCaptain | null>;
  status: RoomStatus;
  state: DraftState;
  /** Increments on every accepted change (lobby or draft); optimistic concurrency key. */
  rev: number;
  createdAt: Date;
  lastActivityAt: Date;
  /** Set when this room was created as a rematch. */
  rematchOf: string | null;
  /** Set on the finished room once a rematch exists, so both captains can follow it. */
  rematchId: string | null;
}

/** One accepted change, in order. `sequence` equals the room `rev` it produced. */
export interface RoomEvent {
  roomId: string;
  sequence: number;
  kind: "created" | "joined" | "left" | "draft" | "rematch";
  /** The draft engine event, for kind "draft". */
  draft: DraftEvent | null;
  side: Side | null;
  actor: { userId: string | null; name: string };
  idempotencyKey: string | null;
  at: Date;
}

export const ROOM_ID_PATTERN = /^[A-Za-z0-9]{10}$/;

export function otherSide(side: Side): Side {
  return side === "radiant" ? "dire" : "radiant";
}

export function seatOf(room: DraftRoom, userId: string): Side | null {
  if (room.captains.radiant?.userId === userId) return "radiant";
  if (room.captains.dire?.userId === userId) return "dire";
  return null;
}

/**
 * Deterministic seed for a timed-out turn, so every server instance that notices the
 * expiry computes the same random pick (only one commit wins anyway).
 */
export function timeoutSeed(roomId: string, stepIndex: number): number {
  let h = 2166136261;
  for (const ch of `${roomId}:${stepIndex}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
