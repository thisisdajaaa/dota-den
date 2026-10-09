import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAIL_COLLECTIONS } from "@/modules/email/email.model";
import { EmailLogRepository } from "@/modules/email/repositories/email-log.repository";
import { EmailSubscriptionsRepository } from "@/modules/email/repositories/email-subscriptions.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let subs: EmailSubscriptionsRepository;
let log: EmailLogRepository;
const now = new Date("2026-10-12T06:30:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const owner = { userId: "u1", accountId32: 1 };
const token = (hash: string) => ({ hash, expiresAt: later(24 * 3_600_000) });

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  subs = new EmailSubscriptionsRepository(async () => db);
  log = new EmailLogRepository(async () => db);
  await subs.ensureIndexes();
  await log.ensureIndexes();
});
afterAll(async () => teardown?.());

describe("EmailSubscriptionsRepository", () => {
  it("confirms a pending address once, with an unexpired token", async () => {
    await subs.startConfirmation("u1", "p@example.com", token("h1"), [now], now);
    expect(await subs.get("u1")).toMatchObject({ email: "p@example.com", status: "pending" });
    expect(await subs.confirmed()).toEqual([]);
    expect(await subs.confirm("h1", "n1", later(25 * 3_600_000))).toBeNull();
    expect(await subs.confirm("nope", "n1", now)).toBeNull();
    expect(await subs.confirm("h1", "n1", later(60_000))).toEqual({ userId: "u1" });
    expect(await subs.confirm("h1", "n2", later(60_000))).toBeNull();
    expect(await subs.confirmed()).toEqual([
      { userId: "u1", email: "p@example.com", unsubscribeNonce: "n1" },
    ]);
    // Only the hash is stored; the confirmed document has none left.
    const doc = await db
      .collection(EMAIL_COLLECTIONS.subscriptions)
      .findOne({ _id: "u1" as never });
    expect(doc).toMatchObject({ confirmTokenHash: null, confirmExpiresAt: null });
  });

  it("a new address restarts confirmation and old unsubscribe nonces stop working", async () => {
    await subs.startConfirmation("u1", "new@example.com", token("h2"), [now, now], now);
    expect(await subs.get("u1")).toMatchObject({
      email: "new@example.com",
      status: "pending",
      unsubscribeNonce: null,
    });
    expect(await subs.unsubscribe("u1", "n1", now)).toBe(false);
    expect(await subs.confirm("h2", "n3", now)).toEqual({ userId: "u1" });
    expect(await subs.unsubscribe("u1", "n3", now)).toBe(true);
    expect(await subs.get("u1")).toMatchObject({ status: "unsubscribed", unsubscribeNonce: null });
    expect(await subs.confirmed()).toEqual([]);
  });

  it("keeps confirmation token hashes unique", async () => {
    await subs.startConfirmation("u2", "u2@example.com", token("same"), [now], now);
    await expect(
      subs.startConfirmation("u3", "u3@example.com", token("same"), [now], now),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await subs.remove("u2")).toBe(true);
    expect(await subs.get("u2")).toBeNull();
  });

  it("exports the address without link secrets, and deletes it with the account", async () => {
    const exported = await subs.exportForOwner(owner);
    expect(exported).toEqual([expect.objectContaining({ id: "u1", email: "new@example.com" })]);
    expect(exported[0]).not.toHaveProperty("confirmTokenHash");
    expect(exported[0]).not.toHaveProperty("unsubscribeNonce");
    expect(await subs.deleteForOwner(owner)).toBe(1);
    expect(await subs.get("u1")).toBeNull();
  });
});

describe("EmailLogRepository", () => {
  it("lets an email be claimed once, with a 90-day expiry", async () => {
    expect(await log.claim("u1", "weekly_digest", "2026-10-12", now)).toBe(true);
    expect(await log.claim("u1", "weekly_digest", "2026-10-12", now)).toBe(false);
    await log.release("u1", "weekly_digest", "2026-10-12");
    expect(await log.claim("u1", "weekly_digest", "2026-10-12", now)).toBe(true);
    await log.recordSent("u1", "weekly_digest", "2026-10-12", "re_1");
    expect(await log.exportForOwner(owner)).toEqual([
      expect.objectContaining({ kind: "weekly_digest", key: "2026-10-12", providerId: "re_1" }),
    ]);
    const ttl = (await db.collection(EMAIL_COLLECTIONS.log).indexes()).find(
      (i) => i.name === "ttl",
    );
    expect(ttl?.expireAfterSeconds).toBe(90 * 24 * 3600);
    expect(await log.deleteForOwner(owner)).toBe(1);
  });
});
