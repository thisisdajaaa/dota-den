import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NOTIFICATIONS_COLLECTIONS } from "@/modules/notifications/notifications.model";
import { NotificationLogRepository } from "@/modules/notifications/repositories/notification-log.repository";
import { NotificationSettingsRepository } from "@/modules/notifications/repositories/notification-settings.repository";
import { PushSubscriptionsRepository } from "@/modules/notifications/repositories/push-subscriptions.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let subs: PushSubscriptionsRepository;
let settings: NotificationSettingsRepository;
let log: NotificationLogRepository;
const now = new Date("2026-10-08T06:30:00Z");
const owner = { userId: "u1", accountId32: 1 };

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  subs = new PushSubscriptionsRepository(async () => db);
  settings = new NotificationSettingsRepository(async () => db);
  log = new NotificationLogRepository(async () => db);
  await subs.ensureIndexes();
  await log.ensureIndexes();
});
afterAll(async () => teardown?.());

const device = (endpoint: string, userId = "u1") => ({
  endpoint,
  userId,
  keys: { p256dh: "p256", auth: "secret" },
  userAgent: "test",
});

describe("PushSubscriptionsRepository", () => {
  it("keeps one row per device, moving it to whoever subscribes it last", async () => {
    await subs.save(device("https://push.example/a"), now);
    await subs.save(device("https://push.example/a"), now);
    await subs.save(device("https://push.example/b"), now);
    expect((await subs.forUser("u1")).map((s) => s.endpoint).sort()).toEqual([
      "https://push.example/a",
      "https://push.example/b",
    ]);
    await subs.save(device("https://push.example/b", "u2"), now);
    expect(await subs.forUser("u1")).toHaveLength(1);
    expect((await subs.subscribedUserIds()).sort()).toEqual(["u1", "u2"]);
  });

  it("only removes a player's own device; dead endpoints go for anyone", async () => {
    expect(await subs.remove("u1", "https://push.example/b")).toBe(false);
    await subs.removeEndpoint("https://push.example/b");
    expect(await subs.forUser("u2")).toEqual([]);
  });

  it("exports devices without their push keys, and deletes them", async () => {
    const exported = await subs.exportForOwner(owner);
    expect(exported).toHaveLength(1);
    expect(exported[0]).not.toHaveProperty("keys");
    expect(exported[0]).toMatchObject({ id: "https://push.example/a", userAgent: "test" });
    expect(await subs.deleteForOwner(owner)).toBe(1);
  });
});

describe("NotificationLogRepository", () => {
  it("lets a notification be claimed once, with a 90-day expiry", async () => {
    expect(await log.claim("u1", "patch_heroes", "7.40", now)).toBe(true);
    expect(await log.claim("u1", "patch_heroes", "7.40", now)).toBe(false);
    expect(await log.claim("u2", "patch_heroes", "7.40", now)).toBe(true);
    await log.release("u1", "patch_heroes", "7.40");
    expect(await log.claim("u1", "patch_heroes", "7.40", now)).toBe(true);
    const ttl = (await db.collection(NOTIFICATIONS_COLLECTIONS.log).indexes()).find(
      (i) => i.name === "ttl",
    );
    expect(ttl?.expireAfterSeconds).toBe(90 * 24 * 3600);
    expect(await log.deleteForOwner(owner)).toBe(1);
  });
});

describe("NotificationSettingsRepository", () => {
  it("saves a player's choices and deletes them with the account", async () => {
    expect(await settings.prefs("u1")).toBeNull();
    const prefs = { session_recap: true, weekly_recap: false, patch_heroes: true };
    await settings.savePrefs("u1", prefs, now);
    expect(await settings.prefs("u1")).toEqual(prefs);
    expect(await settings.deleteForOwner(owner)).toBe(1);
  });
});
