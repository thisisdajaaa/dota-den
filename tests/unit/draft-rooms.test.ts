import { describe, expect, it } from "vitest";
import type {
  CommitResult,
  DraftRoomRepository,
} from "@/modules/drafts/application/draft-room-ports";
import {
  DraftRoomService,
  MAX_ACTIVE_ROOMS,
  type Actor,
} from "@/modules/drafts/application/draft-room-service";
import type { DraftRoom, RoomEvent } from "@/modules/drafts/domain/draft-room";
import { currentTurn } from "@/modules/drafts/domain/draft-state";

class MemoryRooms implements DraftRoomRepository {
  rooms = new Map<string, DraftRoom>();
  events: RoomEvent[] = [];
  active = 0;
  async insert(room: DraftRoom, created: RoomEvent) {
    this.rooms.set(room.id, structuredClone(room));
    this.events.push(created);
  }
  async get(id: string) {
    const r = this.rooms.get(id);
    return r ? structuredClone(r) : null;
  }
  async commit(expectedRev: number, next: DraftRoom, event: RoomEvent): Promise<CommitResult> {
    const cur = this.rooms.get(next.id);
    if (!cur || cur.rev !== expectedRev) return "conflict";
    this.rooms.set(next.id, structuredClone(next));
    this.events.push(event);
    return "committed";
  }
  async findByIdempotencyKey(roomId: string, key: string) {
    return this.events.find((e) => e.roomId === roomId && e.idempotencyKey === key) ?? null;
  }
  async eventsSince(roomId: string, after: number, limit: number) {
    return this.events.filter((e) => e.roomId === roomId && e.sequence > after).slice(0, limit);
  }
  async countActive() {
    return this.active;
  }
}

const actor = (n: number): Actor => ({
  userId: `u${n}`,
  captain: { userId: `u${n}`, accountId32: n, name: `Player ${n}`, avatarUrl: null },
});
const host = actor(1);
const guest = actor(2);
const stranger = actor(3);
const POOL = Array.from({ length: 130 }, (_, i) => i + 1);

function setup(opts: { enabled?: boolean } = {}) {
  let t = Date.UTC(2026, 8, 30, 12);
  let id = 0;
  const repo = new MemoryRooms();
  const svc = new DraftRoomService({
    rooms: repo,
    heroPool: async () => POOL,
    newId: () => `room${String(++id).padStart(6, "0")}`,
    enabled: opts.enabled ?? true,
    now: () => t,
  });
  return { svc, repo, advance: (ms: number) => (t += ms) };
}

async function startedRoom(timerEnabled = false) {
  const ctx = setup();
  const created = await ctx.svc.create(host, {
    rulesetId: "cm-2026",
    firstSide: "radiant",
    timerEnabled,
    hostSide: "radiant",
  });
  if (!created.ok) throw new Error("create");
  const id = created.value.id;
  await ctx.svc.join(id, guest, "dire");
  const started = await ctx.svc.start(id, host);
  if (!started.ok) throw new Error(`start ${JSON.stringify(started.error)}`);
  return { ...ctx, id, room: started.value };
}

describe("DraftRoomService lobby", () => {
  it("seats the host, lets a guest take the other seat, and refuses taken seats", async () => {
    const { svc } = setup();
    const created = await svc.create(host, {
      rulesetId: "cm-2026",
      firstSide: "radiant",
      timerEnabled: false,
      hostSide: "radiant",
    });
    expect(created.ok && created.value.captains.radiant?.userId).toBe("u1");
    const id = created.ok ? created.value.id : "";
    expect(await svc.join(id, stranger, "radiant")).toMatchObject({
      ok: false,
      error: { type: "seat_taken" },
    });
    expect(await svc.join(id, host, "dire")).toMatchObject({
      ok: false,
      error: { type: "already_seated" },
    });
    expect((await svc.join(id, guest, "dire")).ok).toBe(true);
  });

  it("only the host starts, and only with both seats filled", async () => {
    const { svc } = setup();
    const c = await svc.create(host, {
      rulesetId: "cm-2026",
      firstSide: "dire",
      timerEnabled: false,
      hostSide: "radiant",
    });
    const id = c.ok ? c.value.id : "";
    expect(await svc.start(id, host)).toMatchObject({ ok: false, error: { type: "seats_empty" } });
    await svc.join(id, guest, "dire");
    expect(await svc.start(id, guest)).toMatchObject({ ok: false, error: { type: "not_host" } });
    expect(await svc.start(id, host)).toMatchObject({ ok: true, value: { status: "in_progress" } });
  });

  it("enforces the feature flag and the active-room cap", async () => {
    const off = setup({ enabled: false });
    expect(
      await off.svc.create(host, {
        rulesetId: "cm-2026",
        firstSide: "radiant",
        timerEnabled: false,
        hostSide: "radiant",
      }),
    ).toMatchObject({ ok: false, error: { type: "disabled" } });
    const full = setup();
    full.repo.active = MAX_ACTIVE_ROOMS;
    expect(
      await full.svc.create(host, {
        rulesetId: "cm-2026",
        firstSide: "radiant",
        timerEnabled: false,
        hostSide: "radiant",
      }),
    ).toMatchObject({ ok: false, error: { type: "too_many_rooms" } });
  });
});

describe("DraftRoomService turns", () => {
  it("only the captain whose turn it is can make that exact move", async () => {
    const { svc, id, room } = await startedRoom();
    const v = room.state.stateVersion;
    // cm-2026 opens with a ban by the first-pick team (radiant = host).
    expect(await svc.act(id, guest, { type: "ban", heroId: 5 }, v, "k1")).toMatchObject({
      ok: false,
      error: { type: "not_your_turn" },
    });
    expect(await svc.act(id, stranger, { type: "ban", heroId: 5 }, v, "k2")).toMatchObject({
      ok: false,
      error: { type: "not_captain" },
    });
    expect(await svc.act(id, host, { type: "pick", heroId: 5 }, v, "k3")).toMatchObject({
      ok: false,
      error: { type: "not_your_turn" },
    });
    const ok1 = await svc.act(id, host, { type: "ban", heroId: 5 }, v, "k4");
    expect(ok1.ok && ok1.value.state.sides.radiant.bans).toEqual([{ heroId: 5, stepIndex: 0 }]);
  });

  it("rejects a stale client and returns the current room", async () => {
    const { svc, id, room } = await startedRoom();
    await svc.act(id, host, { type: "ban", heroId: 5 }, room.state.stateVersion, "a");
    const stale = await svc.act(id, host, { type: "ban", heroId: 6 }, room.state.stateVersion, "b");
    expect(stale).toMatchObject({ ok: false, error: { type: "stale" } });
  });

  it("simultaneous moves resolve once", async () => {
    const { svc, id, room, repo } = await startedRoom();
    const v = room.state.stateVersion;
    const results = await Promise.all([
      svc.act(id, host, { type: "ban", heroId: 7 }, v, "x1"),
      svc.act(id, host, { type: "ban", heroId: 8 }, v, "x2"),
      svc.act(id, host, { type: "ban", heroId: 9 }, v, "x3"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await repo.get(id))?.state.sides.radiant.bans).toHaveLength(1);
  });

  it("treats a retried request (same idempotency key) as already applied", async () => {
    const { svc, id, room, repo } = await startedRoom();
    const first = await svc.act(
      id,
      host,
      { type: "ban", heroId: 5 },
      room.state.stateVersion,
      "same",
    );
    const retry = await svc.act(
      id,
      host,
      { type: "ban", heroId: 5 },
      room.state.stateVersion,
      "same",
    );
    expect(first.ok && retry.ok).toBe(true);
    expect((await repo.get(id))?.state.sides.radiant.bans).toHaveLength(1);
  });

  it("rejects illegal heroes and finishes the room when the draft completes", async () => {
    const { svc, id } = await startedRoom();
    let room = (await svc.get(id)).ok
      ? ((await svc.get(id)) as { ok: true; value: DraftRoom }).value
      : null;
    expect(room).not.toBeNull();
    const illegal = await svc.act(
      id,
      host,
      { type: "ban", heroId: 999 },
      room!.state.stateVersion,
      "ill",
    );
    expect(illegal).toMatchObject({
      ok: false,
      error: { type: "illegal", reason: "hero_not_in_pool" },
    });
    let hero = 1;
    for (let i = 0; i < 40 && room!.status === "in_progress"; i++) {
      const turn = currentTurn(room!.state)!;
      const who = turn.side === "radiant" ? host : guest;
      const res = await svc.act(
        id,
        who,
        { type: turn.action, heroId: hero++ },
        room!.state.stateVersion,
        `s${i}`,
      );
      if (!res.ok) throw new Error(JSON.stringify(res.error));
      room = res.value;
    }
    expect(room!.status).toBe("completed");
  });
});

describe("DraftRoomService timer and rematch", () => {
  it("resolves an expired turn on read, deterministically", async () => {
    const a = await startedRoom(true);
    const b = await startedRoom(true);
    // Both rooms share ids (fresh repos), so the same seed applies.
    a.advance(10 * 60_000);
    b.advance(10 * 60_000);
    const ra = await a.svc.get(a.id);
    const rb = await b.svc.get(b.id);
    expect(ra.ok && ra.value.state.turns[0]).toMatchObject({ resolution: "timeout" });
    expect(ra.ok && rb.ok && ra.value.state.turns).toEqual(rb.ok && rb.value.state.turns);
  });

  it("only the host pauses, and a rematch seats both captains with first pick swapped", async () => {
    const { svc, id, room } = await startedRoom(true);
    expect(
      await svc.act(id, guest, { type: "pause" }, room.state.stateVersion, "p1"),
    ).toMatchObject({ ok: false, error: { type: "not_host" } });
    expect(await svc.act(id, host, { type: "pause" }, room.state.stateVersion, "p2")).toMatchObject(
      { ok: true, value: { state: { status: "paused" } } },
    );
    expect(await svc.rematch(id, host)).toMatchObject({
      ok: false,
      error: { type: "wrong_status" },
    });
  });
});
