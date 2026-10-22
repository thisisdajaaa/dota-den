import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Subscription } from "@/modules/plus/domain/subscription";
import { PLUS_COLLECTIONS } from "@/modules/plus/plus.model";
import { SubscriptionsRepository } from "@/modules/plus/repositories/subscriptions.repository";
import { WebhookEventsRepository } from "@/modules/plus/repositories/webhook-events.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new SubscriptionsRepository(async () => db).ensureIndexes();
  await new WebhookEventsRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

const at = (iso: string) => new Date(iso);
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  provider: "lemonsqueezy",
  subscriptionId: "1",
  userId: "u1",
  accountId32: 11,
  status: "active",
  plan: "monthly",
  variantId: "501",
  customerId: "77",
  renewsAt: at("2026-11-23T00:00:00Z"),
  endsAt: null,
  trialEndsAt: null,
  providerUpdatedAt: at("2026-10-23T12:00:00Z"),
  testMode: false,
  portalUrl: "https://dd.lemonsqueezy.com/billing?signed=1",
  portalUrlAt: at("2026-10-23T12:00:00Z"),
  pastDueSince: null,
  createdAt: at("2026-10-23T12:00:00Z"),
  updatedAt: at("2026-10-23T12:00:00Z"),
  ...over,
});

describe("SubscriptionsRepository (Mongo)", () => {
  it("creates its indexes", async () => {
    const names = (await db.collection(PLUS_COLLECTIONS.subscriptions).indexes()).map(
      (i) => i.name,
    );
    expect(names).toEqual(expect.arrayContaining(["by_user", "by_account_status", "by_status"]));
  });

  it("inserts with schemaVersion, then only moves forward in provider time", async () => {
    const repo = new SubscriptionsRepository(async () => db);
    expect(await repo.upsertIfNewer(sub({ subscriptionId: "fw" }))).toBe("inserted");
    const raw = await db
      .collection(PLUS_COLLECTIONS.subscriptions)
      .findOne({ _id: "lemonsqueezy:fw" as never });
    expect(raw).toMatchObject({ schemaVersion: 1, status: "active", userId: "u1" });

    const newer = sub({
      subscriptionId: "fw",
      status: "cancelled",
      endsAt: at("2026-11-23T00:00:00Z"),
      providerUpdatedAt: at("2026-10-23T13:00:00Z"),
      createdAt: at("2030-01-01T00:00:00Z"),
    });
    expect(await repo.upsertIfNewer(newer)).toBe("updated");
    const older = sub({
      subscriptionId: "fw",
      status: "active",
      providerUpdatedAt: at("2026-10-23T12:30:00Z"),
    });
    expect(await repo.upsertIfNewer(older)).toBe("stale");
    const stored = await repo.find("lemonsqueezy", "fw");
    expect(stored).toMatchObject({ status: "cancelled" });
    // The first-seen date is kept.
    expect(stored?.createdAt).toEqual(at("2026-10-23T12:00:00Z"));
  });

  it("settles concurrent first deliveries without losing the newest", async () => {
    const repo = new SubscriptionsRepository(async () => db);
    const results = await Promise.all(
      [10, 11, 12, 13].map((m) =>
        repo.upsertIfNewer(
          sub({
            subscriptionId: "race",
            providerUpdatedAt: new Date(Date.UTC(2026, 9, 23, 12, m)),
          }),
        ),
      ),
    );
    expect(results.filter((r) => r === "inserted")).toHaveLength(1);
    expect((await repo.find("lemonsqueezy", "race"))?.providerUpdatedAt).toEqual(
      new Date(Date.UTC(2026, 9, 23, 12, 13)),
    );
  });

  it("finds possibly-entitled subscriptions by user and account, and counts by status", async () => {
    const repo = new SubscriptionsRepository(async () => db);
    await repo.upsertIfNewer(sub({ subscriptionId: "q1", userId: "qa", accountId32: 501 }));
    await repo.upsertIfNewer(
      sub({ subscriptionId: "q2", userId: "qb", accountId32: 502, status: "expired" }),
    );
    await repo.upsertIfNewer(sub({ subscriptionId: "q3", userId: null, accountId32: null }));
    expect((await repo.forUser("qa")).map((s) => s.subscriptionId)).toEqual(["q1"]);
    expect(
      (await repo.possiblyEntitledForAccounts([501, 502])).map((s) => s.subscriptionId),
    ).toEqual(["q1"]);
    const entitled = (await repo.possiblyEntitled()).map((s) => s.subscriptionId);
    expect(entitled).toContain("q1");
    expect(entitled).not.toContain("q2");
    expect(entitled).not.toContain("q3");
    const counts = await repo.countsByStatus();
    expect(counts).toEqual(
      expect.arrayContaining([
        { status: "expired", linked: true, count: 1 },
        expect.objectContaining({ status: "active", linked: false }),
      ]),
    );
  });

  it("exports without the signed portal link and deletes one owner's subscriptions", async () => {
    const repo = new SubscriptionsRepository(async () => db);
    await repo.upsertIfNewer(sub({ subscriptionId: "p1", userId: "gdpr" }));
    await repo.upsertIfNewer(sub({ subscriptionId: "p2", userId: "keep" }));
    const owner = { userId: "gdpr", accountId32: 1 };
    const exported = await repo.exportForOwner(owner);
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ id: "lemonsqueezy:p1", status: "active" });
    expect(exported[0]).not.toHaveProperty("portalUrl");
    expect(exported[0]).not.toHaveProperty("schemaVersion");
    expect(await repo.deleteForOwner(owner)).toBe(1);
    expect(await repo.forUser("gdpr")).toEqual([]);
    expect(await repo.forUser("keep")).toHaveLength(1);
  });
});

describe("WebhookEventsRepository (Mongo)", () => {
  it("claims an event once, records the outcome and can release it", async () => {
    const repo = new WebhookEventsRepository(async () => db);
    const event = {
      id: "lemonsqueezy:abc",
      provider: "lemonsqueezy" as const,
      eventName: "subscription_created",
      subscriptionId: "1",
      userId: "u9",
      receivedAt: at("2026-10-23T12:00:00Z"),
    };
    const claims = await Promise.all([repo.claim(event), repo.claim(event), repo.claim(event)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await repo.finish(event.id, "applied");
    const raw = await db
      .collection(PLUS_COLLECTIONS.webhookEvents)
      .findOne({ _id: event.id as never });
    expect(raw).toMatchObject({ outcome: "applied", schemaVersion: 1, userId: "u9" });
    await repo.release(event.id);
    expect(await repo.claim(event)).toBe(true);
  });

  it("expires events with a TTL and deletes one owner's events", async () => {
    const repo = new WebhookEventsRepository(async () => db);
    const indexes = await db.collection(PLUS_COLLECTIONS.webhookEvents).indexes();
    expect(indexes.find((i) => i.name === "ttl")?.expireAfterSeconds).toBe(90 * 24 * 3600);
    await repo.claim({
      id: "lemonsqueezy:del",
      provider: "lemonsqueezy",
      eventName: "subscription_updated",
      subscriptionId: "1",
      userId: "gone",
      receivedAt: new Date(),
    });
    const owner = { userId: "gone", accountId32: 1 };
    expect(await repo.exportForOwner(owner)).toHaveLength(1);
    expect(await repo.deleteForOwner(owner)).toBe(1);
  });
});
