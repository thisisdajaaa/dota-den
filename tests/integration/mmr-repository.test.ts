import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MmrJournalService } from "@/modules/mmr/application/mmr-journal-service";
import {
  ensureMmrIndexes,
  MongoMmrEntryRepository,
} from "@/modules/mmr/infrastructure/mongo-mmr-repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await ensureMmrIndexes(db);
});
afterAll(async () => teardown?.());

const input = (mmr: number, iso: string) => ({ mmr, observedAt: new Date(iso), note: null });

describe("MmrJournalService + Mongo", () => {
  it("creates, lists oldest-first, edits and deletes the owner's entries", async () => {
    const journal = new MmrJournalService(new MongoMmrEntryRepository(db));
    const me = { userId: "u1", accountId32: 1 };
    const a = await journal.create(me, input(5000, "2026-09-02T10:00:00Z"));
    await journal.create(me, input(4950, "2026-09-01T10:00:00Z"));

    expect((await journal.list(me)).map((e) => e.mmr)).toEqual([4950, 5000]);

    const edited = await journal.update(me, a.id, {
      ...input(5025, "2026-09-02T10:00:00Z"),
      note: "fixed typo",
    });
    expect(edited).toMatchObject({ ok: true, value: { mmr: 5025, note: "fixed typo" } });

    expect((await journal.delete(me, a.id)).ok).toBe(true);
    expect((await journal.list(me)).map((e) => e.mmr)).toEqual([4950]);
  });

  it("never lets one user edit or delete another user's entry", async () => {
    const journal = new MmrJournalService(new MongoMmrEntryRepository(db));
    const owner = { userId: "owner", accountId32: 2 };
    const intruder = { userId: "intruder", accountId32: 2 };
    const entry = await journal.create(owner, input(3000, "2026-09-01T10:00:00Z"));

    expect(await journal.update(intruder, entry.id, input(1, "2026-09-01T10:00:00Z"))).toEqual({
      ok: false,
      error: { type: "not_found" },
    });
    expect((await journal.delete(intruder, entry.id)).ok).toBe(false);
    expect((await journal.list(owner))[0].mmr).toBe(3000);
    expect(await journal.list(intruder)).toEqual([]);
  });

  it("keeps multiple accounts of the same user separate", async () => {
    const journal = new MmrJournalService(new MongoMmrEntryRepository(db));
    await journal.create({ userId: "multi", accountId32: 10 }, input(6000, "2026-09-01T10:00:00Z"));
    await journal.create({ userId: "multi", accountId32: 11 }, input(2000, "2026-09-01T10:00:00Z"));
    expect((await journal.list({ userId: "multi", accountId32: 10 })).map((e) => e.mmr)).toEqual([
      6000,
    ]);
    expect((await journal.list({ userId: "multi", accountId32: 11 })).map((e) => e.mmr)).toEqual([
      2000,
    ]);
  });

  it("rejects malformed ids without throwing", async () => {
    const journal = new MmrJournalService(new MongoMmrEntryRepository(db));
    expect((await journal.delete({ userId: "u1", accountId32: 1 }, "not-an-id")).ok).toBe(false);
  });
});
