import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DraftHistoryService } from "@/modules/drafts/application/draft-history-service";
import { DraftRoomService, type Actor } from "@/modules/drafts/application/draft-room-service";
import type { DraftHistoryRecord } from "@/modules/drafts/domain/draft-history";
import type { DraftRoom } from "@/modules/drafts/domain/draft-room";
import { availableHeroes, currentTurn } from "@/modules/drafts/domain/draft-state";
import {
  DRAFT_HISTORY_COLLECTION,
  ensureDraftHistoryIndexes,
  MongoDraftHistoryRepository,
} from "@/modules/drafts/infrastructure/mongo-draft-history";
import {
  ensureDraftRoomIndexes,
  MongoDraftRoomRepository,
} from "@/modules/drafts/infrastructure/mongo-draft-rooms";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensureDraftRoomIndexes(db);
  await ensureDraftHistoryIndexes(db);
});
afterAll(async () => teardown?.());

const actor = (n: number): Actor => ({
  userId: `u${n}`,
  captain: { userId: `u${n}`, accountId32: n, name: `Player ${n}`, avatarUrl: null },
});
const POOL = Array.from({ length: 130 }, (_, i) => i + 1);

function services() {
  let id = 0;
  const rooms = new MongoDraftRoomRepository(db);
  const repo = new MongoDraftHistoryRepository(db);
  const history = new DraftHistoryService({
    history: repo,
    getRoom: (roomId) => rooms.get(roomId),
    existingRoomIds: (ids) => rooms.existingIds(ids),
  });
  const svc = new DraftRoomService({
    rooms,
    heroPool: async () => POOL,
    newId: () => `hist${String(++id).padStart(6, "0")}`,
    enabled: true,
    onCompleted: async (room) => void (await history.recordCompleted(room)),
  });
  return { svc, history, repo };
}

/** A started practice room with every turn but the last one played. */
async function almostDone(svc: DraftRoomService): Promise<DraftRoom> {
  const created = await svc.create(actor(1), {
    rulesetId: "practice-simple",
    firstSide: "radiant",
    timerEnabled: false,
    hostSide: "radiant",
  });
  if (!created.ok) throw new Error("create");
  await svc.join(created.value.id, actor(2), "dire");
  const started = await svc.start(created.value.id, actor(1));
  if (!started.ok) throw new Error("start");
  let room = started.value;
  for (let i = 0; i < 17; i++) {
    const turn = currentTurn(room.state)!;
    const res = await svc.act(
      room.id,
      turn.side === "radiant" ? actor(1) : actor(2),
      { type: turn.action, heroId: availableHeroes(room.state, POOL)[0] },
      room.state.stateVersion,
      `step-${room.id}-${i}`,
    );
    if (!res.ok) throw new Error(JSON.stringify(res.error));
    room = res.value;
  }
  return room;
}

describe("draft history in MongoDB", () => {
  it("records a room once when the final move and later reads race", async () => {
    const { svc, history } = services();
    const room = await almostDone(svc);
    const turn = currentTurn(room.state)!;
    const who = turn.side === "radiant" ? actor(1) : actor(2);
    const free = availableHeroes(room.state, POOL);
    // Several competing final picks: one commit wins and completes the room.
    const moves = await Promise.all(
      free
        .slice(0, 5)
        .map((heroId, i) =>
          svc.act(room.id, who, { type: "pick", heroId }, room.state.stateVersion, `fin-${i}`),
        ),
    );
    expect(moves.filter((m) => m.ok)).toHaveLength(1);
    const done = moves.find((m) => m.ok)!;
    if (!done.ok) throw new Error("unreachable");

    // And many concurrent recorders (retries, backfill on read) on top of it.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => history.recordCompleted(done.value)),
    );
    expect(results.every((r) => r === "duplicate")).toBe(true);
    expect(await db.collection(DRAFT_HISTORY_COLLECTION).countDocuments({ roomId: room.id })).toBe(
      1,
    );
  });

  it("keeps one record under concurrent first inserts", async () => {
    const { repo } = services();
    const record: DraftHistoryRecord = {
      roomId: "raceroom01",
      completedAt: new Date(),
      rulesetId: "cm-2026",
      rulesetVersion: 1,
      firstSide: "radiant",
      captains: { radiant: actor(1).captain, dire: actor(2).captain },
      sides: { radiant: { picks: [1], bans: [] }, dire: { picks: [2], bans: [] } },
      snapshot: "x",
      rematchOf: null,
      chainId: "raceroom01",
      result: null,
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.insertOnce(record)));
    expect(results.filter((r) => r === "inserted")).toHaveLength(1);
    expect(
      await db.collection(DRAFT_HISTORY_COLLECTION).countDocuments({ roomId: "raceroom01" }),
    ).toBe(1);
    const indexes = await db.collection(DRAFT_HISTORY_COLLECTION).indexes();
    expect(indexes.find((i) => i.name === "uniq_roomId")?.unique).toBe(true);
  });

  it("lists each captain's drafts newest first, by friend, with opponents", async () => {
    const { repo } = services();
    const make = (roomId: string, a: number, b: number, day: number): DraftHistoryRecord => ({
      roomId,
      completedAt: new Date(Date.UTC(2026, 5, day)),
      rulesetId: "cm-2026",
      rulesetVersion: 1,
      firstSide: "radiant",
      captains: { radiant: actor(a).captain, dire: actor(b).captain },
      sides: { radiant: { picks: [], bans: [] }, dire: { picks: [], bans: [] } },
      snapshot: "x",
      rematchOf: null,
      chainId: roomId,
      result: null,
    });
    await repo.insertOnce(make("list000001", 11, 12, 1));
    await repo.insertOnce(make("list000002", 13, 11, 3));
    await repo.insertOnce(make("list000003", 11, 12, 5));
    await repo.insertOnce(make("list000004", 12, 13, 7));

    const mine = await repo.listForCaptain("u11", { friendAccountId: null, skip: 0, limit: 10 });
    expect(mine.total).toBe(3);
    expect(mine.items.map((r) => r.roomId)).toEqual(["list000003", "list000002", "list000001"]);

    const paged = await repo.listForCaptain("u11", { friendAccountId: null, skip: 1, limit: 1 });
    expect(paged.items.map((r) => r.roomId)).toEqual(["list000002"]);

    const withFriend = await repo.listForCaptain("u11", {
      friendAccountId: 12,
      skip: 0,
      limit: 10,
    });
    expect(withFriend.items.map((r) => r.roomId)).toEqual(["list000003", "list000001"]);

    const opponents = await repo.opponents("u11", 10);
    expect(opponents).toEqual([
      { accountId32: 12, name: "Player 12", avatarUrl: null, drafts: 2 },
      { accountId32: 13, name: "Player 13", avatarUrl: null, drafts: 1 },
    ]);

    // Only a captain of that draft can set its result.
    const result = {
      winner: "dire" as const,
      setBy: { userId: "u13", name: "P" },
      setAt: new Date(),
    };
    expect(await repo.setResult("list000001", "u13", result)).toBe(false);
    expect(await repo.setResult("list000001", "u12", result)).toBe(true);
    expect((await repo.get("list000001"))?.result?.winner).toBe("dire");
  });
});
