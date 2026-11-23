import { createHmac } from "node:crypto";
import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Subscription } from "@/modules/plus/domain/subscription";
import { PolarProvider } from "@/modules/plus/infrastructure/polar-provider";
import { PLUS_COLLECTIONS } from "@/modules/plus/plus.model";
import { newTrial } from "@/modules/plus/domain/trial";
import { SubscriptionsRepository } from "@/modules/plus/repositories/subscriptions.repository";
import { TrialsRepository } from "@/modules/plus/repositories/trials.repository";
import { WebhookEventsRepository } from "@/modules/plus/repositories/webhook-events.repository";
import { BillingWebhookService } from "@/modules/plus/services/billing-webhook.service";
import { polarSubscriptionEvent } from "../support/plus-fakes";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  await new SubscriptionsRepository(async () => db).ensureIndexes();
  await new WebhookEventsRepository(async () => db).ensureIndexes();
  await new TrialsRepository(async () => db).ensureIndexes();
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
    // All three are live-mode subscriptions: the test-mode count has none of them.
    expect(await repo.countsByStatus(true)).toEqual([]);
    const counts = await repo.countsByStatus(false);
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

describe("TrialsRepository (Mongo)", () => {
  it("records one trial per Steam account, even when two starts race", async () => {
    const repo = new TrialsRepository(async () => db);
    const now = at("2026-11-23T12:00:00Z");
    const results = await Promise.all([
      repo.start(newTrial("t1", 901, now)),
      repo.start(newTrial("t1", 901, now)),
      repo.start(newTrial("t2", 901, now)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repo.find("t1", 901)).toMatchObject({ accountId32: 901 });
    // Another user id on the same account finds it through the account.
    expect(await repo.find("someone-else", 901)).not.toBeNull();
    expect(await repo.find("nobody")).toBeNull();

    await repo.start(newTrial("t3", 902, at("2026-11-01T00:00:00Z"))); // ended on the 8th
    expect(await repo.activeUserIds(now)).toEqual([expect.stringMatching(/^t[12]$/)]);
    expect(await repo.counts(now)).toMatchObject({ active: 1 });

    const owner = { userId: "t3", accountId32: 902 };
    expect(await repo.exportForOwner(owner)).toEqual([
      expect.objectContaining({ id: "steam:902", userId: "t3" }),
    ]);
    expect(await repo.deleteForOwner(owner)).toBe(1);
    expect(await db.collection(PLUS_COLLECTIONS.trials).countDocuments({ accountId32: 902 })).toBe(
      0,
    );
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
    const STALE = 120_000;
    const claims = await Promise.all([
      repo.claim(event, STALE),
      repo.claim(event, STALE),
      repo.claim(event, STALE),
    ]);
    expect(claims.filter((c) => c === "claimed")).toHaveLength(1);
    expect(claims.filter((c) => c === "in_progress")).toHaveLength(2);
    // A delivery killed mid-way: its claim is taken over once it's older than STALE.
    const later = { ...event, receivedAt: at("2026-10-23T12:01:00Z") };
    expect(await repo.claim(later, STALE)).toBe("in_progress");
    const muchLater = { ...event, receivedAt: at("2026-10-23T12:03:00Z") };
    expect(await repo.claim(muchLater, STALE)).toBe("claimed");
    expect(await repo.claim(muchLater, STALE)).toBe("in_progress");
    await repo.finish(event.id, "applied");
    expect(await repo.claim(muchLater, STALE)).toBe("duplicate");
    const raw = await db
      .collection(PLUS_COLLECTIONS.webhookEvents)
      .findOne({ _id: event.id as never });
    expect(raw).toMatchObject({ outcome: "applied", schemaVersion: 1, userId: "u9" });
    await repo.release(event.id);
    expect(await repo.claim(event, STALE)).toBe("claimed");
  });

  it("expires events with a TTL and deletes one owner's events", async () => {
    const repo = new WebhookEventsRepository(async () => db);
    const indexes = await db.collection(PLUS_COLLECTIONS.webhookEvents).indexes();
    expect(indexes.find((i) => i.name === "ttl")?.expireAfterSeconds).toBe(90 * 24 * 3600);
    await repo.claim(
      {
        id: "lemonsqueezy:del",
        provider: "lemonsqueezy",
        eventName: "subscription_updated",
        subscriptionId: "1",
        userId: "gone",
        receivedAt: new Date(),
      },
      120_000,
    );
    const owner = { userId: "gone", accountId32: 1 };
    expect(await repo.exportForOwner(owner)).toHaveLength(1);
    expect(await repo.deleteForOwner(owner)).toBe(1);
  });
});

describe("Polar webhooks through the Mongo repositories", () => {
  it("stores a Polar subscription by its id, keyed events by webhook-id, and moves forward", async () => {
    const key = Buffer.from("polar-integration-key-0000000001");
    const now = new Date("2026-10-23T12:30:00Z");
    const ts = String(Math.floor(now.getTime() / 1000));
    const user = "c".repeat(24);
    const subId = "7e7e7e7e-0000-4000-8000-000000000001";
    const webhooks = new BillingWebhookService({
      provider: new PolarProvider({
        webhookSecret: `whsec_${key.toString("base64")}`,
        productIds: { monthly: "e7751461-934e-4bbc-befa-2593e1e56dd2" },
        organizationSlug: "dota-den",
        server: "production",
        appUrl: "https://www.dota-den.com",
        api: { createCheckout: vi.fn(), createCustomerSession: vi.fn() },
        now: () => now,
      }),
      subscriptions: new SubscriptionsRepository(async () => db),
      events: new WebhookEventsRepository(async () => db),
      users: { byId: async (id) => (id === user ? { id, accountId32: 42 } : null) },
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => now,
    });
    const deliver = (body: string, id: string) => {
      const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
      const h: Record<string, string> = {
        "webhook-id": id,
        "webhook-timestamp": ts,
        "webhook-signature": `v1,${sig}`,
      };
      return webhooks.receive({ body, header: (n) => h[n] ?? null });
    };

    const created = polarSubscriptionEvent({ id: subId, userId: user });
    expect(await deliver(created, "msg_int_1")).toEqual({ outcome: "applied" });
    expect(await deliver(created, "msg_int_1")).toEqual({ outcome: "duplicate" });
    const canceled = polarSubscriptionEvent({
      type: "subscription.canceled",
      id: subId,
      userId: user,
      cancelAtPeriodEnd: true,
      endsAt: "2026-11-23T12:00:00.000000Z",
      modifiedAt: "2026-10-23T12:10:00.000000Z",
    });
    expect(await deliver(canceled, "msg_int_2")).toEqual({ outcome: "applied" });
    const late = polarSubscriptionEvent({
      type: "subscription.updated",
      id: subId,
      userId: user,
      modifiedAt: "2026-10-23T12:05:00.000000Z",
    });
    expect(await deliver(late, "msg_int_3")).toEqual({ outcome: "stale" });

    const stored = await db
      .collection(PLUS_COLLECTIONS.subscriptions)
      .findOne({ _id: `polar:${subId}` as never });
    expect(stored).toMatchObject({
      provider: "polar",
      userId: user,
      accountId32: 42,
      status: "cancelled",
      plan: "monthly",
      endsAt: at("2026-11-23T12:00:00Z"),
      testMode: false,
    });
    expect(JSON.stringify(stored)).not.toContain("buyer@example.com");
    const event = await db
      .collection(PLUS_COLLECTIONS.webhookEvents)
      .findOne({ _id: "polar:msg_int_2" as never });
    expect(event).toMatchObject({ provider: "polar", outcome: "applied", userId: user });
  });
});
