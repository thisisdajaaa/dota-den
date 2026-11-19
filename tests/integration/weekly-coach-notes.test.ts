import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coachNoteId } from "@/modules/report/domain/weekly-coach";
import type { StoredCoachNote } from "@/modules/report/report.ports";
import { CoachNotesRepository } from "@/modules/report/repositories/replay-reads.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let notes: CoachNotesRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  notes = new CoachNotesRepository(async () => db);
  await notes.ensureIndexes();
});
afterAll(async () => teardown?.());

const USER = "c".repeat(24);
const WEEK = "2026-11-09";

const stored = (over: Partial<StoredCoachNote> = {}): StoredCoachNote => ({
  id: coachNoteId(USER, WEEK),
  userId: USER,
  week: WEEK,
  locale: "fil",
  model: "m",
  version: "weekly-coach-v1",
  games: 9,
  facts: [{ key: "games", label: "Games played", value: 9, unit: "count" }],
  note: {
    headline: "Ayos na linggo",
    paragraphs: ["9 na laro ka ngayong linggo."],
    factKeys: ["games"],
    fix: {
      title: "Bawas death",
      detail: "9 na laro: maglakad kasama ang team.",
      factKeys: ["games"],
    },
  },
  createdAt: new Date("2026-11-16T00:00:00Z"),
  ...over,
});

describe("CoachNotesRepository", () => {
  it("keeps the first note for a player and week (a racing second writer gets it back)", async () => {
    const first = await notes.saveOnce(stored());
    expect(first.note.headline).toBe("Ayos na linggo");
    const second = await notes.saveOnce(
      stored({ locale: "en", note: { ...stored().note, headline: "A good week" } }),
    );
    expect(second.locale).toBe("fil");
    expect(second.note.headline).toBe("Ayos na linggo");
    expect(await notes.get(coachNoteId(USER, WEEK))).toEqual(first);
    expect(await notes.get(coachNoteId(USER, "2026-11-02"))).toBeNull();
  });

  it("exports and deletes a player's notes with their data", async () => {
    await notes.saveOnce(stored({ id: coachNoteId(USER, "2026-11-02"), week: "2026-11-02" }));
    await notes.saveOnce(stored({ id: coachNoteId("d".repeat(24), WEEK), userId: "d".repeat(24) }));
    const owner = { userId: USER, accountId32: 1 };
    expect(await notes.exportForOwner(owner)).toHaveLength(2);
    expect(await notes.deleteForOwner(owner)).toBe(2);
    expect(await notes.get(coachNoteId(USER, WEEK))).toBeNull();
    expect(await notes.get(coachNoteId("d".repeat(24), WEEK))).not.toBeNull();
  });
});
