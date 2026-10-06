import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionNote } from "@/modules/sessions/domain/session-note";
import {
  SessionNotesRepository,
  SessionSettingsRepository,
} from "@/modules/sessions/repositories/sessions.repository";
import { SESSION_COLLECTIONS } from "@/modules/sessions/sessions.model";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new SessionNotesRepository(async () => db).ensureIndexes();
  await new SessionSettingsRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

function note(over: Partial<SessionNote> = {}): SessionNote {
  return {
    userId: "owner",
    accountId32: 22202,
    sessionId: "22202:7000000001",
    matchIds: ["7000000001"],
    sessionStartedAt: new Date("2026-09-01T18:00:00Z"),
    note: "Played calm",
    goal: "Under 5 deaths",
    goalMet: null,
    updatedAt: new Date("2026-09-01T21:00:00Z"),
    ...over,
  };
}

describe("SessionNotesRepository", () => {
  it("creates the unique (userId, sessionId) and (userId, updatedAt) indexes", async () => {
    const indexes = await db.collection(SESSION_COLLECTIONS.notes).indexes();
    const unique = indexes.find((i) => i.name === "uniq_user_session");
    expect(unique).toMatchObject({ key: { userId: 1, sessionId: 1 }, unique: true });
    expect(indexes.find((i) => i.name === "by_user_recent")?.key).toEqual({
      userId: 1,
      updatedAt: -1,
    });
    await expect(
      db.collection(SESSION_COLLECTIONS.notes).insertMany([
        { userId: "dup", sessionId: "1:1" },
        { userId: "dup", sessionId: "1:1" },
      ]),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("upserts: the second save replaces the first instead of adding a document", async () => {
    const repo = new SessionNotesRepository(async () => db);
    const first = await repo.upsert(note());
    expect(first).toEqual(note());

    const later = new Date("2026-09-02T09:00:00Z");
    const second = await repo.upsert(
      note({ note: "Tilted late", goalMet: "partly", updatedAt: later }),
    );
    expect(second).toMatchObject({ note: "Tilted late", goalMet: "partly", updatedAt: later });
    expect(
      await db
        .collection(SESSION_COLLECTIONS.notes)
        .countDocuments({ userId: "owner", sessionId: "22202:7000000001" }),
    ).toBe(1);
    expect(await repo.get("owner", "22202:7000000001")).toEqual(second);
  });

  it("settles concurrent first saves into one document", async () => {
    const repo = new SessionNotesRepository(async () => db);
    const id = "22202:7000000099";
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => repo.upsert(note({ sessionId: id, note: `v${i}` }))),
    );
    expect(
      await db
        .collection(SESSION_COLLECTIONS.notes)
        .countDocuments({ userId: "owner", sessionId: id }),
    ).toBe(1);
  });

  it("never returns another user's notes", async () => {
    const repo = new SessionNotesRepository(async () => db);
    await repo.upsert(note({ userId: "alice", sessionId: "5:1", accountId32: 5 }));
    await repo.upsert(note({ userId: "bob", sessionId: "5:1", accountId32: 5, note: "bob's" }));

    expect((await repo.get("alice", "5:1"))?.note).toBe("Played calm");
    expect((await repo.get("bob", "5:1"))?.note).toBe("bob's");
    expect(await repo.get("mallory", "5:1")).toBeNull();
    expect(await repo.listForSessions("mallory", ["5:1"])).toEqual([]);
    expect((await repo.listForSessions("alice", ["5:1", "5:2"])).map((n) => n.userId)).toEqual([
      "alice",
    ]);
    expect(await repo.listRecent("mallory", 5, 10)).toEqual([]);
  });

  it("lists one account's notes, most recently edited first", async () => {
    const repo = new SessionNotesRepository(async () => db);
    const u = "recent-user";
    await repo.upsert(
      note({ userId: u, sessionId: "7:1", accountId32: 7, updatedAt: new Date(1) }),
    );
    await repo.upsert(
      note({ userId: u, sessionId: "7:2", accountId32: 7, updatedAt: new Date(3) }),
    );
    await repo.upsert(
      note({ userId: u, sessionId: "8:1", accountId32: 8, updatedAt: new Date(2) }),
    );
    expect((await repo.listRecent(u, 7, 10)).map((n) => n.sessionId)).toEqual(["7:2", "7:1"]);
    expect(await repo.listRecent(u, 7, 1)).toHaveLength(1);
  });
});

describe("SessionSettingsRepository", () => {
  it("stores one gap per user", async () => {
    const repo = new SessionSettingsRepository(async () => db);
    expect(await repo.getGap("gap-user")).toBeNull();
    await repo.setGap("gap-user", 90, new Date());
    await repo.setGap("gap-user", 30, new Date());
    expect(await repo.getGap("gap-user")).toBe(30);
    expect(await repo.getGap("someone-else")).toBeNull();
    expect(
      await db.collection(SESSION_COLLECTIONS.settings).countDocuments({ userId: "gap-user" }),
    ).toBe(1);
  });

  it("falls back to the default for an unsupported stored value", async () => {
    await db
      .collection(SESSION_COLLECTIONS.settings)
      .insertOne({ userId: "odd", gapMinutes: 45, updatedAt: new Date(), schemaVersion: 1 });
    expect(await new SessionSettingsRepository(async () => db).getGap("odd")).toBeNull();
  });
});
