import "server-only";
import type { NextRequest } from "next/server";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/common/errors/app-error";
import { apiLimit } from "@/common/http/api-limits";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { getRouteUser, optionalUser } from "@/modules/identity";
import type { Actor, HistoryError, RoomError } from "./dtos/responses/drafts.dto";
import { eventView, roomView } from "./dtos/responses/room-views.dto";
import {
  CreateRoomSchema,
  JoinRoomSchema,
  ReportResultSchema,
  RoomActionSchema,
  ROOM_ID,
  RoomParamsSchema,
} from "./schemas/rooms.schema";
import type { DraftHistoryService } from "./services/draft-history.service";
import type { DraftRoomService } from "./services/draft-room.service";
import type { RoomEvent } from "./domain/draft-room";

const NO_STORE = { "cache-control": "private, no-store" };

/** A malformed room id is a room that doesn't exist (404, like an expired one). */
function roomIdOf(params: { roomId: string }): string {
  if (!ROOM_ID.test(params.roomId)) throw new NotFoundError("Draft room not found");
  return params.roomId;
}

/** Room actions, per client IP (from the environment: DRAFT rate limits). */
const ACTIONS = () => ({ name: "room-act", ...apiLimit("roomAction"), byIp: true });
/** ~1 poll/second per viewer, with headroom for a few tabs; counted per instance. */
const POLLS = () => ({ name: "room-poll", ...apiLimit("roomPoll"), byIp: true, local: true });
const CREATES = () => ({ name: "room-create", ...apiLimit("roomCreate"), byIp: true });

export function roomError(error: RoomError, viewerUserId: string | null): AppError {
  switch (error.type) {
    case "not_found":
      return new NotFoundError("This draft room doesn't exist or has expired.");
    case "disabled":
      return new ForbiddenError("Draft rooms are turned off right now.");
    case "too_many_rooms":
      return new RateLimitedError("Too many draft rooms are open right now. Try again soon.");
    case "invalid_options":
      return new ValidationError("Those room settings aren't valid.");
    case "seat_taken":
      return new ConflictError("Someone already took that seat.");
    case "already_seated":
      return new ConflictError("You're already sitting in this room.");
    case "not_host":
      return new ForbiddenError("Only the host can do that.");
    case "not_captain":
      return new ForbiddenError("Only the captains can do that.");
    case "not_your_turn":
      return new ConflictError("It isn't your turn.");
    case "wrong_status":
      return new ConflictError(`The room is ${error.status.replace("_", " ")}.`);
    case "seats_empty":
      return new ConflictError("Both captain seats need to be filled first.");
    case "stale":
      // The client was behind: send the current room so it can resync immediately.
      return new ConflictError("The draft moved on; showing the latest state.", {
        room: roomView(error.room, viewerUserId),
      });
    case "illegal":
      return new ValidationError(`That move isn't allowed (${error.reason.replaceAll("_", " ")}).`);
  }
}

function historyError(error: HistoryError): AppError {
  switch (error.type) {
    case "not_found":
      return new NotFoundError("This draft doesn't exist or has expired.");
    case "not_completed":
      return new ConflictError("The draft isn't finished yet.");
    case "not_captain":
      return new ForbiddenError("Only the two captains can report the result.");
  }
}

/** Multiplayer draft rooms (ADR 0003): create, poll, seats, moves, rematch and the result. */
export class DraftRoomsController {
  constructor(
    private readonly deps: {
      rooms: DraftRoomService;
      history: DraftHistoryService;
      events: (roomId: string, after: number) => Promise<RoomEvent[]>;
      /** The signed-in player's public name and avatar, for their captain seat. */
      captainProfile: (accountId32: number) => Promise<{
        personaName: string | null;
        avatarUrl: string | null;
      } | null>;
    },
  ) {}

  /** Guard: the signed-in user as a room actor (name/avatar from their public profile). */
  private requireActor = async (req: NextRequest): Promise<Actor> => {
    const user = await getRouteUser(req);
    if (!user) throw new UnauthorizedError("Sign in to do that");
    const profile = await this.deps.captainProfile(user.accountId32);
    return {
      userId: user.id,
      captain: {
        userId: user.id,
        accountId32: user.accountId32,
        name: profile?.personaName ?? `Player ${user.accountId32}`,
        avatarUrl: profile?.avatarUrl ?? null,
      },
    };
  };

  /** POST /api/v1/drafts/rooms: create a room; the host takes a seat. */
  create = handler(
    {
      guard: this.requireActor,
      rateLimit: CREATES,
      body: CreateRoomSchema,
      invalidMessage: "Invalid room settings",
    },
    async ({ user: actor, body }) => {
      const res = await this.deps.rooms.create(actor, body);
      if (!res.ok) throw roomError(res.error, actor.userId);
      return ServiceResponse.created({ roomId: res.value.id }, "Room created");
    },
  );

  /**
   * GET /api/v1/drafts/rooms/:roomId: poll/resync. The room plus events after `?after=`;
   * `?rev=<n>` answers `{unchanged: true}` cheaply when nothing moved.
   */
  get = handler(
    { guard: optionalUser, rateLimit: POLLS, params: RoomParamsSchema },
    async ({ req, user, params }) => {
      const res = await this.deps.rooms.get(roomIdOf(params));
      if (!res.ok) throw roomError(res.error, user?.id ?? null);
      const knownRev = Number(req.nextUrl.searchParams.get("rev"));
      if (Number.isInteger(knownRev) && knownRev === res.value.rev) {
        return ServiceResponse.success({
          unchanged: true as const,
          rev: knownRev,
          serverNow: Date.now(),
        }).withHeaders(NO_STORE);
      }
      const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
      const events = await this.deps.events(roomIdOf(params), after);
      return ServiceResponse.success({
        room: roomView(res.value, user?.id ?? null),
        events: events.map(eventView),
      }).withHeaders(NO_STORE);
    },
  );

  /** POST /api/v1/drafts/rooms/:roomId/join */
  join = handler(
    {
      guard: this.requireActor,
      rateLimit: ACTIONS,
      params: RoomParamsSchema,
      body: JoinRoomSchema,
      invalidMessage: "Pick a side",
    },
    async ({ user: actor, params, body }) => {
      const res = await this.deps.rooms.join(roomIdOf(params), actor, body.side);
      if (!res.ok) throw roomError(res.error, actor.userId);
      return ServiceResponse.success({ room: roomView(res.value, actor.userId) });
    },
  );

  /** POST /api/v1/drafts/rooms/:roomId/leave */
  leave = handler(
    { guard: this.requireActor, rateLimit: ACTIONS, params: RoomParamsSchema },
    async ({ user: actor, params }) => {
      const res = await this.deps.rooms.leave(roomIdOf(params), actor);
      if (!res.ok) throw roomError(res.error, actor.userId);
      return ServiceResponse.success({ room: roomView(res.value, actor.userId) });
    },
  );

  /** POST /api/v1/drafts/rooms/:roomId/start */
  start = handler(
    { guard: this.requireActor, rateLimit: ACTIONS, params: RoomParamsSchema },
    async ({ user: actor, params }) => {
      const res = await this.deps.rooms.start(roomIdOf(params), actor);
      if (!res.ok) throw roomError(res.error, actor.userId);
      return ServiceResponse.success({ room: roomView(res.value, actor.userId) });
    },
  );

  /** POST /api/v1/drafts/rooms/:roomId/actions: a pick, ban, pause or resume. */
  act = handler(
    {
      guard: this.requireActor,
      rateLimit: ACTIONS,
      params: RoomParamsSchema,
      body: RoomActionSchema,
      invalidMessage: "Invalid move",
    },
    async ({ user: actor, params, body }) => {
      const { action, expectedVersion, idempotencyKey } = body;
      const res = await this.deps.rooms.act(
        roomIdOf(params),
        actor,
        action,
        expectedVersion,
        idempotencyKey,
      );
      if (!res.ok) throw roomError(res.error, actor.userId);
      return ServiceResponse.success({ room: roomView(res.value, actor.userId) });
    },
  );

  /** POST /api/v1/drafts/rooms/:roomId/rematch */
  rematch = handler(
    { guard: this.requireActor, rateLimit: ACTIONS, params: RoomParamsSchema },
    async ({ user: actor, params }) => {
      const res = await this.deps.rooms.rematch(roomIdOf(params), actor);
      if (!res.ok) throw roomError(res.error, actor.userId);
      return ServiceResponse.success({
        roomId: res.value.id,
        room: roomView(res.value, actor.userId),
      });
    },
  );

  /** GET /api/v1/drafts/rooms/:roomId/result: the self-reported result of the real game. */
  getResult = handler(
    { guard: optionalUser, rateLimit: POLLS, params: RoomParamsSchema },
    async ({ user, params }) => {
      const res = await this.deps.history.getResult(roomIdOf(params), user?.id ?? null);
      if (!res.ok) throw historyError(res.error);
      return ServiceResponse.success({ result: res.value }).withHeaders(NO_STORE);
    },
  );

  /** POST /api/v1/drafts/rooms/:roomId/result: either captain reports who won (or not played). */
  reportResult = handler(
    {
      guard: this.requireActor,
      rateLimit: ACTIONS,
      params: RoomParamsSchema,
      body: ReportResultSchema,
      invalidMessage: "Choose Radiant, Dire or not played.",
    },
    async ({ user: actor, params, body }) => {
      const res = await this.deps.history.reportResult(
        roomIdOf(params),
        { userId: actor.userId, name: actor.captain.name },
        body.winner,
      );
      if (!res.ok) throw historyError(res.error);
      return ServiceResponse.success({ result: res.value }).withHeaders(NO_STORE);
    },
  );
}
