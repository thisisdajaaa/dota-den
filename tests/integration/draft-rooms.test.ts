import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DraftRoomService, type Actor } from "@/modules/drafts/application/draft-room-service";
import {
  DRAFT_ROOM_COLLECTIONS,
  ensureDraftRoomIndexes,
  MongoDraftRoomRepository,
} from "@/modules/drafts/infrastructure/mongo-draft-rooms";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensureDraftRoomIndexes(db);
});
afterAll(async () => teardown?.());

const actor = (n: number): Actor => ({
  userId: `u${n}`,
  captain: { userId: `u${n}`, accountId32: n, name: `Player ${n}`, avatarUrl: null },
});

describe("MongoDraftRoomRepository", () => {
  it("accepts exactly one of several concurrent moves and logs it once", async () => {
    let id = 0;
    const svc = new DraftRoomService({
      rooms: new MongoDraftRoomRepository(db),
      heroPool: async () => Array.from({ length: 130 }, (_, i) => i + 1),
      newId: () => `itroom${String(++id).padStart(4, "0")}`,
      enabled: true,
    });
    const created = await svc.create(actor(1), {
      rulesetId: "cm-2026",
      firstSide: "radiant",
      timerEnabled: false,
      hostSide: "radiant",
    });
    if (!created.ok) throw new Error("create");
    const roomId = created.value.id;
    await svc.join(roomId, actor(2), "dire");
    const started = await svc.start(roomId, actor(1));
    if (!started.ok) throw new Error("start");
    const v = started.value.state.stateVersion;

    const results = await Promise.all(
      [10, 11, 12, 13, 14].map((hero, i) =>
        svc.act(roomId, actor(1), { type: "ban", heroId: hero }, v, `race-${i}`),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const room = await svc.get(roomId);
    expect(room.ok && room.value.state.sides.radiant.bans).toHaveLength(1);

    const events = await db
      .collection(DRAFT_ROOM_COLLECTIONS.events)
      .find({ roomId })
      .sort({ sequence: 1 })
      .toArray();
    expect(events.map((e) => e.kind)).toEqual(["created", "joined", "draft", "draft"]);
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("returns events after a sequence for resync", async () => {
    const repo = new MongoDraftRoomRepository(db);
    const events = await repo.eventsSince("itroom0001", 2, 50);
    expect(events.every((e) => e.sequence > 2)).toBe(true);
  });
});
