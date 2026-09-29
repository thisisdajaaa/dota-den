import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { getRouteUser } from "@/modules/identity/composition";
import { getPlayerProfile } from "@/modules/matches/composition";
import type { Actor, RoomError } from "./application/draft-room-service";
import type { EventView, RoomView } from "./application/room-views";
import { seatOf, type DraftRoom, type RoomEvent } from "./domain/draft-room";
import type { Side } from "./domain/draft-state";

export type { EventView, RoomView };

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

/** The signed-in user as a room actor (name/avatar from their public profile). */
export async function routeActor(req: NextRequest): Promise<Actor | null> {
  const user = await getRouteUser(req);
  if (!user) return null;
  const profile = await getPlayerProfile(user.accountId32);
  return {
    userId: user.id,
    captain: {
      userId: user.id,
      accountId32: user.accountId32,
      name: profile?.personaName ?? `Player ${user.accountId32}`,
      avatarUrl: profile?.avatarUrl ?? null,
    },
  };
}

export function roomErrorResponse(error: RoomError, viewerUserId: string | null): NextResponse {
  switch (error.type) {
    case "not_found":
      return apiError("not_found", "This draft room doesn't exist or has expired.");
    case "disabled":
      return apiError("forbidden", "Draft rooms are turned off right now.");
    case "too_many_rooms":
      return apiError("rate_limited", "Too many draft rooms are open right now. Try again soon.");
    case "invalid_options":
      return apiError("bad_request", "Those room settings aren't valid.");
    case "seat_taken":
      return apiError("conflict", "Someone already took that seat.");
    case "already_seated":
      return apiError("conflict", "You're already sitting in this room.");
    case "not_host":
      return apiError("forbidden", "Only the host can do that.");
    case "not_captain":
      return apiError("forbidden", "Only the captains can do that.");
    case "not_your_turn":
      return apiError("conflict", "It isn't your turn.");
    case "wrong_status":
      return apiError("conflict", `The room is ${error.status.replace("_", " ")}.`);
    case "seats_empty":
      return apiError("conflict", "Both captain seats need to be filled first.");
    case "stale":
      // The client was behind: send the current room so it can resync immediately.
      return apiError("conflict", "The draft moved on; showing the latest state.", {
        room: roomView(error.room, viewerUserId),
      });
    case "illegal":
      return apiError(
        "bad_request",
        `That move isn't allowed (${error.reason.replaceAll("_", " ")}).`,
      );
  }
}

export function noStore(res: NextResponse): NextResponse {
  res.headers.set("cache-control", "private, no-store");
  return res;
}

export async function readRoomParams(ctx: {
  params: Promise<{ roomId: string }>;
}): Promise<string | null> {
  const { roomId } = await ctx.params;
  return /^[A-Za-z0-9]{10}$/.test(roomId) ? roomId : null;
}
