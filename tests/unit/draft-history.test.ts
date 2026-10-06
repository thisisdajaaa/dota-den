import { describe, expect, it } from "vitest";
import type { DraftHistoryPort, HistoryOpponent } from "@/modules/drafts/draft-history.ports";
import { DraftHistoryService } from "@/modules/drafts/services/draft-history.service";
import type { CommitResult, DraftRoomsPort } from "@/modules/drafts/draft-room.ports";
import { DraftRoomService } from "@/modules/drafts/services/draft-room.service";
import { type Actor } from "@/modules/drafts/dtos/responses/drafts.dto";
import { decodeSnapshot } from "@/modules/drafts/domain/snapshot";
import {
  headToHead,
  type DraftHistoryRecord,
  type ReportedResult,
} from "@/modules/drafts/domain/draft-history";
import type { DraftRoom, RoomEvent } from "@/modules/drafts/domain/draft-room";
import { availableHeroes, currentTurn } from "@/modules/drafts/domain/draft-state";

class MemoryRooms implements DraftRoomsPort {
  rooms = new Map<string, DraftRoom>();
  events: RoomEvent[] = [];
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
    return 0;
  }
}

class MemoryHistory implements DraftHistoryPort {
  records = new Map<string, DraftHistoryRecord>();
  inserts = 0;
  async insertOnce(record: DraftHistoryRecord) {
    this.inserts++;
    if (this.records.has(record.roomId)) return "duplicate" as const;
    this.records.set(record.roomId, structuredClone(record));
    return "inserted" as const;
  }
  async get(roomId: string) {
    const r = this.records.get(roomId);
    return r ? structuredClone(r) : null;
  }
  async setResult(roomId: string, userId: string, result: ReportedResult) {
    const r = this.records.get(roomId);
    if (!r || (r.captains.radiant.userId !== userId && r.captains.dire.userId !== userId))
      return false;
    r.result = structuredClone(result);
    return true;
  }
  async listForCaptain(
    userId: string,
    opts: { friendAccountId: number | null; skip: number; limit: number },
  ) {
    const all = [...this.records.values()]
      .filter((r) => r.captains.radiant.userId === userId || r.captains.dire.userId === userId)
      .filter(
        (r) =>
          opts.friendAccountId === null ||
          r.captains.radiant.accountId32 === opts.friendAccountId ||
          r.captains.dire.accountId32 === opts.friendAccountId,
      )
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
    return { items: all.slice(opts.skip, opts.skip + opts.limit), total: all.length };
  }
  async opponents(): Promise<HistoryOpponent[]> {
    return [];
  }
  async captainTotals() {
    return [];
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

function setup() {
  let t = Date.UTC(2026, 8, 30, 12);
  let id = 0;
  const rooms = new MemoryRooms();
  const history = new MemoryHistory();
  const historySvc = new DraftHistoryService({
    history,
    getRoom: (roomId) => rooms.get(roomId),
    existingRoomIds: async (ids) => new Set(ids.filter((i) => rooms.rooms.has(i))),
    now: () => t,
  });
  let completions = 0;
  const svc = new DraftRoomService({
    rooms,
    heroPool: async () => POOL,
    newId: () => `room${String(++id).padStart(6, "0")}`,
    enabled: true,
    now: () => (t += 1000),
    onCompleted: async (room) => {
      completions++;
      await historySvc.recordCompleted(room);
    },
  });
  return { svc, historySvc, rooms, history, completions: () => completions };
}

async function startedRoom(ctx: ReturnType<typeof setup>) {
  const created = await ctx.svc.create(host, {
    rulesetId: "practice-simple",
    firstSide: "radiant",
    timerEnabled: false,
    hostSide: "radiant",
  });
  if (!created.ok) throw new Error("create");
  await ctx.svc.join(created.value.id, guest, "dire");
  const started = await ctx.svc.start(created.value.id, host);
  if (!started.ok) throw new Error("start");
  return started.value;
}

/** Play every turn with the first available hero. */
async function finish(ctx: ReturnType<typeof setup>, room: DraftRoom): Promise<DraftRoom> {
  let cur = room;
  for (let i = 0; i < 40 && cur.status !== "completed"; i++) {
    const turn = currentTurn(cur.state)!;
    const who = turn.side === "radiant" ? host : guest;
    const heroId = availableHeroes(cur.state, POOL)[0];
    const res = await ctx.svc.act(
      cur.id,
      who,
      { type: turn.action, heroId },
      cur.state.stateVersion,
      `k-${cur.id}-${i}`,
    );
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    cur = res.value;
  }
  return cur;
}

describe("draft history recording", () => {
  it("records a finished room exactly once, with lineups and a replayable snapshot", async () => {
    const ctx = setup();
    const done = await finish(ctx, await startedRoom(ctx));
    expect(done.status).toBe("completed");
    expect(ctx.completions()).toBe(1);
    expect(ctx.history.records.size).toBe(1);

    const record = ctx.history.records.get(done.id)!;
    expect(record.captains.radiant.userId).toBe("u1");
    expect(record.captains.dire.userId).toBe("u2");
    expect(record.rulesetId).toBe("practice-simple");
    expect(record.firstSide).toBe("radiant");
    expect(record.sides.radiant.picks).toEqual(done.state.sides.radiant.picks.map((p) => p.heroId));
    expect(record.sides.dire.bans).toEqual(done.state.sides.dire.bans.map((p) => p.heroId));
    expect(record.sides.radiant.picks).toHaveLength(5);
    expect(record.sides.dire.bans).toHaveLength(4);
    expect(record.result).toBeNull();
    expect(record.chainId).toBe(done.id);
    const snap = decodeSnapshot(record.snapshot);
    expect(snap.ok && snap.value.t).toHaveLength(18);

    // Re-recording (a retry, or the backfill on read) changes nothing.
    expect(await ctx.historySvc.recordCompleted(done)).toBe("duplicate");
    expect(ctx.history.records.size).toBe(1);
  });

  it("does not record unfinished rooms", async () => {
    const ctx = setup();
    const room = await startedRoom(ctx);
    expect(await ctx.historySvc.recordCompleted(room)).toBe("skipped");
    expect(ctx.history.records.size).toBe(0);
  });

  it("links a rematch to the first room of the chain", async () => {
    const ctx = setup();
    const first = await finish(ctx, await startedRoom(ctx));
    const rematch = await ctx.svc.rematch(first.id, host);
    if (!rematch.ok) throw new Error("rematch");
    const started = await ctx.svc.start(rematch.value.id, host);
    if (!started.ok) throw new Error("start");
    const second = await finish(ctx, started.value);
    const again = await ctx.svc.rematch(second.id, host);
    if (!again.ok) throw new Error("rematch 2");
    const startedAgain = await ctx.svc.start(again.value.id, host);
    if (!startedAgain.ok) throw new Error("start 3");
    await finish(ctx, startedAgain.value);
    const rec2 = ctx.history.records.get(second.id)!;
    expect(rec2.rematchOf).toBe(first.id);
    expect(rec2.chainId).toBe(first.id);
    expect(ctx.history.records.get(again.value.id)?.chainId).toBe(first.id);
  });
});

describe("reported game results", () => {
  it("lets only the two captains report and change the result", async () => {
    const ctx = setup();
    const done = await finish(ctx, await startedRoom(ctx));

    const denied = await ctx.historySvc.reportResult(
      done.id,
      { userId: stranger.userId, name: "Player 3" },
      "radiant",
    );
    expect(denied).toEqual({ ok: false, error: { type: "not_captain" } });

    const byGuest = await ctx.historySvc.reportResult(
      done.id,
      { userId: guest.userId, name: "Player 2" },
      "radiant",
    );
    expect(byGuest.ok && byGuest.value.winner).toBe("radiant");
    expect(ctx.history.records.get(done.id)?.result?.setBy.userId).toBe("u2");

    const changed = await ctx.historySvc.reportResult(
      done.id,
      { userId: host.userId, name: "Player 1" },
      "not_played",
    );
    expect(changed.ok && changed.value).toMatchObject({
      winner: "not_played",
      setByName: "Player 1",
      canReport: true,
    });

    const spectator = await ctx.historySvc.getResult(done.id, null);
    expect(spectator.ok && spectator.value).toMatchObject({
      winner: "not_played",
      canReport: false,
    });
  });

  it("refuses unfinished and unknown rooms", async () => {
    const ctx = setup();
    const room = await startedRoom(ctx);
    const res = await ctx.historySvc.reportResult(room.id, { userId: "u1", name: "P1" }, "dire");
    expect(res).toEqual({ ok: false, error: { type: "not_completed" } });
    const missing = await ctx.historySvc.getResult("nope000000", "u1");
    expect(missing).toEqual({ ok: false, error: { type: "not_found" } });
  });

  it("saves a finished room that the completion hook missed", async () => {
    const ctx = setup();
    const done = await finish(ctx, await startedRoom(ctx));
    ctx.history.records.clear();
    const res = await ctx.historySvc.getResult(done.id, "u1");
    expect(res.ok && res.value.recorded).toBe(true);
    expect(ctx.history.records.has(done.id)).toBe(true);
  });
});

describe("head to head", () => {
  const rec = (
    n: number,
    viewerSide: "radiant" | "dire",
    winner: ReportedResult["winner"] | null,
    picks: { you: number[]; them: number[] },
    theirBans: number[] = [],
  ): DraftHistoryRecord => {
    const you = actor(1).captain;
    const them = actor(2).captain;
    const other = viewerSide === "radiant" ? "dire" : "radiant";
    return {
      roomId: `r${n}`,
      completedAt: new Date(Date.UTC(2026, 8, n)),
      rulesetId: "cm-2026",
      rulesetVersion: 1,
      firstSide: "radiant",
      captains:
        viewerSide === "radiant" ? { radiant: you, dire: them } : { radiant: them, dire: you },
      sides: {
        [viewerSide]: { picks: picks.you, bans: [] },
        [other]: { picks: picks.them, bans: theirBans },
      } as DraftHistoryRecord["sides"],
      snapshot: "x",
      rematchOf: null,
      chainId: `r${n}`,
      result: winner
        ? { winner, setBy: { userId: "u2", name: "Player 2" }, setAt: new Date() }
        : null,
    };
  };

  it("counts only reported results in the record and tallies heroes", () => {
    const records = [
      rec(1, "radiant", "radiant", { you: [1, 2], them: [3] }, [7, 8]), // won
      rec(2, "dire", "radiant", { you: [1], them: [3, 4] }, [7]), // lost
      rec(3, "dire", "dire", { you: [1, 5], them: [4] }), // won
      rec(4, "radiant", null, { you: [2], them: [3] }, [8]), // unreported
      rec(5, "radiant", "not_played", { you: [9], them: [3] }), // not played
    ];
    const h = headToHead(records, "u1");
    expect(h).toMatchObject({ drafts: 5, wins: 2, losses: 1, unreported: 1, notPlayed: 1 });
    expect(h.yourPicks[0]).toEqual({ heroId: 1, count: 3 });
    expect(h.friendPicks[0]).toEqual({ heroId: 3, count: 4 });
    expect(h.bannedAgainstYou).toEqual([
      { heroId: 7, count: 2 },
      { heroId: 8, count: 2 },
    ]);
  });

  it("is empty with no reported results", () => {
    const h = headToHead([rec(1, "radiant", null, { you: [1], them: [2] })], "u1");
    expect(h).toMatchObject({ drafts: 1, wins: 0, losses: 0, unreported: 1 });
  });

  it("summarises one friend through the service", async () => {
    const ctx = setup();
    await finish(ctx, await startedRoom(ctx));
    const summary = await ctx.historySvc.headToHead("u1", 2);
    expect(summary).toMatchObject({ drafts: 1, unreported: 1, truncated: false });
    expect(summary?.friend.name).toBe("Player 2");
    expect(await ctx.historySvc.headToHead("u1", 99)).toBeNull();
  });
});
