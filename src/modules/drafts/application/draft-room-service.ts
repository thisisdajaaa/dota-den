import { err, ok, type Result } from "@/common/result";
import {
  otherSide,
  seatOf,
  timeoutSeed,
  type DraftRoom,
  type RoomCaptain,
  type RoomEvent,
} from "../domain/draft-room";
import {
  applyEvent,
  createDraft,
  currentTurn,
  isComplete,
  resolveTime,
  type DraftError,
  type DraftEvent,
  type Side,
} from "../domain/draft-state";
import { listRulesets } from "../domain/rulesets";
import type { DraftRoomRepository } from "./draft-room-ports";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An engine event before the room stamps its version and time. */
type DraftInput = DistributiveOmit<DraftEvent, "expectedVersion" | "at">;

/**
 * Abuse caps for the polling prototype (ADR 0003). These are the defaults; composition
 * passes the configured values (DRAFT_ROOMS_MAX_ACTIVE, DRAFT_ROOMS_ACTIVE_WINDOW_MINUTES).
 */
export const MAX_ACTIVE_ROOMS = 50;
export const ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

export type RoomError =
  | { type: "not_found" }
  | { type: "disabled" }
  | { type: "too_many_rooms" }
  | { type: "invalid_options" }
  | { type: "seat_taken" }
  | { type: "already_seated" }
  | { type: "not_host" }
  | { type: "not_captain" }
  | { type: "not_your_turn" }
  | { type: "wrong_status"; status: DraftRoom["status"] }
  | { type: "seats_empty" }
  | { type: "stale"; room: DraftRoom }
  | { type: "illegal"; reason: DraftError["type"] };

export interface Actor {
  userId: string;
  captain: RoomCaptain;
}

export interface CreateRoomOptions {
  rulesetId: string;
  firstSide: Side;
  timerEnabled: boolean;
  /** The side the host sits on. */
  hostSide: Side;
}

export type RoomAction =
  { type: "pick" | "ban"; heroId: number } | { type: "pause" } | { type: "resume" };

export class DraftRoomService {
  private readonly now: () => number;

  constructor(
    private readonly deps: {
      rooms: DraftRoomRepository;
      heroPool: () => Promise<number[]>;
      newId: () => string;
      enabled: boolean;
      /** Rooms active (lobby or in progress) within `activeWindowMs` count toward the cap. */
      limits?: { maxActiveRooms?: number; activeWindowMs?: number };
      now?: () => number;
      /**
       * Called once by the writer whose commit finished the draft (saves it to history).
       * Must be idempotent: a lost response can make a retried read call it again.
       */
      onCompleted?: (room: DraftRoom) => Promise<void>;
    },
  ) {
    this.now = deps.now ?? (() => Date.now());
  }

  async create(actor: Actor, opts: CreateRoomOptions): Promise<Result<DraftRoom, RoomError>> {
    if (!this.deps.enabled) return err({ type: "disabled" });
    const ruleset = listRulesets().find((r) => r.id === opts.rulesetId);
    if (!ruleset) return err({ type: "invalid_options" });
    const nowMs = this.now();
    const windowMs = this.deps.limits?.activeWindowMs ?? ACTIVE_WINDOW_MS;
    const cap = this.deps.limits?.maxActiveRooms ?? MAX_ACTIVE_ROOMS;
    const active = await this.deps.rooms.countActive(new Date(nowMs - windowMs));
    if (active >= cap) return err({ type: "too_many_rooms" });

    const draft = createDraft({
      rulesetId: ruleset.id,
      rulesetVersion: ruleset.version,
      firstSide: opts.firstSide,
      timerEnabled: opts.timerEnabled,
    });
    if (!draft.ok) return err({ type: "invalid_options" });
    const now = new Date(nowMs);
    const room: DraftRoom = {
      id: this.deps.newId(),
      hostUserId: actor.userId,
      captains: {
        radiant: opts.hostSide === "radiant" ? actor.captain : null,
        dire: opts.hostSide === "dire" ? actor.captain : null,
      },
      status: "lobby",
      state: draft.value,
      rev: 1,
      createdAt: now,
      lastActivityAt: now,
      rematchOf: null,
      rematchId: null,
    };
    await this.deps.rooms.insert(
      room,
      this.event(room, "created", actor, null, opts.hostSide, null),
    );
    return ok(room);
  }

  /** Read a room, resolving an expired turn first (deterministically) so every viewer agrees. */
  async get(roomId: string): Promise<Result<DraftRoom, RoomError>> {
    const room = await this.deps.rooms.get(roomId);
    if (!room) return err({ type: "not_found" });
    return ok(await this.settleTimeout(room));
  }

  async join(roomId: string, actor: Actor, side: Side): Promise<Result<DraftRoom, RoomError>> {
    const room = await this.deps.rooms.get(roomId);
    if (!room) return err({ type: "not_found" });
    if (room.status !== "lobby") return err({ type: "wrong_status", status: room.status });
    if (seatOf(room, actor.userId)) return err({ type: "already_seated" });
    if (room.captains[side]) return err({ type: "seat_taken" });
    const next = this.bump(room, { captains: { ...room.captains, [side]: actor.captain } });
    return this.commit(room, next, this.event(next, "joined", actor, null, side, null));
  }

  async leave(roomId: string, actor: Actor): Promise<Result<DraftRoom, RoomError>> {
    const room = await this.deps.rooms.get(roomId);
    if (!room) return err({ type: "not_found" });
    if (room.status !== "lobby") return err({ type: "wrong_status", status: room.status });
    const side = seatOf(room, actor.userId);
    if (!side) return err({ type: "not_captain" });
    const next = this.bump(room, { captains: { ...room.captains, [side]: null } });
    return this.commit(room, next, this.event(next, "left", actor, null, side, null));
  }

  async start(roomId: string, actor: Actor): Promise<Result<DraftRoom, RoomError>> {
    const room = await this.deps.rooms.get(roomId);
    if (!room) return err({ type: "not_found" });
    if (room.hostUserId !== actor.userId) return err({ type: "not_host" });
    if (room.status !== "lobby") return err({ type: "wrong_status", status: room.status });
    if (!room.captains.radiant || !room.captains.dire) return err({ type: "seats_empty" });
    return this.applyDraft(room, actor, { type: "start" }, null, null);
  }

  /**
   * A captain's move. `expectedVersion` is the draft stateVersion the client saw; a stale
   * client gets `stale` with the current room. `idempotencyKey` makes retries safe.
   */
  async act(
    roomId: string,
    actor: Actor,
    action: RoomAction,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<Result<DraftRoom, RoomError>> {
    const existing = await this.deps.rooms.findByIdempotencyKey(roomId, idempotencyKey);
    const loaded = await this.deps.rooms.get(roomId);
    if (!loaded) return err({ type: "not_found" });
    if (existing) return ok(loaded); // already applied: a retry of the same request

    const room = await this.settleTimeout(loaded);
    if (room.status !== "in_progress") return err({ type: "wrong_status", status: room.status });
    const side = seatOf(room, actor.userId);

    if (action.type === "pause" || action.type === "resume") {
      if (room.hostUserId !== actor.userId) return err({ type: "not_host" });
    } else {
      if (!side) return err({ type: "not_captain" });
      const turn = currentTurn(room.state);
      if (!turn || turn.side !== side || turn.action !== action.type) {
        return err({ type: "not_your_turn" });
      }
    }
    if (room.state.stateVersion !== expectedVersion) return err({ type: "stale", room });

    const draftEvent: DraftInput =
      action.type === "pick" || action.type === "ban"
        ? { type: action.type, side: side!, heroId: action.heroId }
        : { type: action.type };
    return this.applyDraft(room, actor, draftEvent, idempotencyKey, side);
  }

  /** A new room with the same captains, sides kept and first pick swapped. */
  async rematch(roomId: string, actor: Actor): Promise<Result<DraftRoom, RoomError>> {
    const room = await this.deps.rooms.get(roomId);
    if (!room) return err({ type: "not_found" });
    if (room.hostUserId !== actor.userId) return err({ type: "not_host" });
    if (room.status !== "completed") return err({ type: "wrong_status", status: room.status });
    const hostSide = seatOf(room, actor.userId) ?? "radiant";
    if (room.rematchId) {
      const existing = await this.deps.rooms.get(room.rematchId);
      if (existing) return ok(existing);
    }
    const created = await this.create(actor, {
      rulesetId: room.state.rulesetId,
      firstSide: otherSide(room.state.firstSide),
      timerEnabled: room.state.timer.enabled,
      hostSide,
    });
    if (!created.ok) return created;
    let rematch = created.value;
    // Seat the other captain too, so the rematch can start straight away.
    const guest = room.captains[otherSide(hostSide)];
    if (guest) {
      const seeded = this.bump(
        { ...rematch, rematchOf: room.id },
        { captains: { ...rematch.captains, [otherSide(hostSide)]: guest } },
      );
      const joined = await this.commit(
        rematch,
        seeded,
        this.event(
          seeded,
          "joined",
          { userId: guest.userId, captain: guest },
          null,
          otherSide(hostSide),
          null,
        ),
      );
      if (!joined.ok) return joined;
      rematch = joined.value;
    }
    // Point the finished room at the rematch so the guest's screen can follow.
    const linked = this.bump(room, { rematchId: rematch.id });
    await this.commit(room, linked, this.event(linked, "rematch", actor, null, null, null));
    return ok(rematch);
  }

  // --- internals -------------------------------------------------------------------------

  private async applyDraft(
    room: DraftRoom,
    actor: Actor | null,
    input: DraftInput,
    idempotencyKey: string | null,
    side: Side | null,
  ): Promise<Result<DraftRoom, RoomError>> {
    const at = Math.max(this.now(), room.state.lastEventAt ?? 0);
    const event = { ...input, expectedVersion: room.state.stateVersion, at } as DraftEvent;
    const applied = applyEvent(room.state, event, {
      mode: "multiplayer",
      heroPool: await this.deps.heroPool(),
    });
    if (!applied.ok) return err({ type: "illegal", reason: applied.error.type });
    const state = applied.value;
    const next = this.bump(room, {
      state,
      status: isComplete(state) ? "completed" : "in_progress",
    });
    const res = await this.commit(
      room,
      next,
      this.event(next, "draft", actor, event, side, idempotencyKey),
    );
    // Only the commit that moved the room to "completed" gets here with that transition.
    if (res.ok && room.status !== "completed" && res.value.status === "completed") {
      await this.deps.onCompleted?.(res.value);
    }
    return res;
  }

  private async settleTimeout(room: DraftRoom): Promise<DraftRoom> {
    if (room.status !== "in_progress") return room;
    const time = resolveTime(room.state, this.now());
    if (!time.timed || !time.expired || time.paused) return room;
    const res = await this.applyDraft(
      room,
      null,
      { type: "timeout", seed: timeoutSeed(room.id, room.state.stepIndex) },
      null,
      time.side,
    );
    if (res.ok) return res.value;
    // Someone else resolved it first: read what they committed.
    return (await this.deps.rooms.get(room.id)) ?? room;
  }

  private async commit(
    prev: DraftRoom,
    next: DraftRoom,
    event: RoomEvent,
  ): Promise<Result<DraftRoom, RoomError>> {
    const res = await this.deps.rooms.commit(prev.rev, next, event);
    if (res === "committed") return ok(next);
    const current = await this.deps.rooms.get(prev.id);
    return err({ type: "stale", room: current ?? prev });
  }

  private bump(room: DraftRoom, patch: Partial<DraftRoom>): DraftRoom {
    return { ...room, ...patch, rev: room.rev + 1, lastActivityAt: new Date(this.now()) };
  }

  private event(
    room: DraftRoom,
    kind: RoomEvent["kind"],
    actor: Actor | null,
    draft: DraftEvent | null,
    side: Side | null,
    idempotencyKey: string | null,
  ): RoomEvent {
    return {
      roomId: room.id,
      sequence: room.rev,
      kind,
      draft,
      side,
      actor: actor
        ? { userId: actor.userId, name: actor.captain.name }
        : { userId: null, name: "Timer" },
      idempotencyKey,
      at: new Date(this.now()),
    };
  }
}
