import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthSessionsRepository } from "@/modules/identity/repositories/auth-sessions.repository";
import { UsersRepository } from "@/modules/identity/repositories/users.repository";
import { VisitDaysRepository } from "@/modules/identity/repositories/visit-days.repository";
import { UsersService } from "@/modules/identity/services/users.service";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let visits: VisitDaysRepository;
let sessions: AuthSessionsRepository;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  visits = new VisitDaysRepository(async () => db);
  sessions = new AuthSessionsRepository(async () => db);
  await visits.ensureIndexes();
});
afterAll(async () => teardown?.());

describe("visit days", () => {
  it("records one row per player per day and merges in session days", async () => {
    let now = new Date("2026-10-08T23:00:00Z");
    const svc = new UsersService({
      users: new UsersRepository(async () => db),
      sessions,
      visits,
      now: () => now,
    });
    await svc.recordVisit("u1");
    await svc.recordVisit("u1");
    now = new Date("2026-10-09T01:00:00Z");
    await svc.recordVisit("u1");
    expect(await db.collection("visit_days").countDocuments({ userId: "u1" })).toBe(2);

    await sessions.create({
      tokenHash: "h1",
      userId: "u1",
      createdAt: new Date("2026-09-30T10:00:00Z"),
      rotatedAt: new Date("2026-10-08T10:00:00Z"),
      expiresAt: new Date("2026-11-30T10:00:00Z"),
    });
    const days = await svc.activeDays(["u1", "u2"]);
    expect(days.get("u1")).toEqual(["2026-09-30", "2026-10-08", "2026-10-09"]);
    expect(days.has("u2")).toBe(false);

    expect(await visits.deleteForOwner({ userId: "u1", accountId32: 1 })).toBe(2);
  });
});
