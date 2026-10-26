import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  signLemonSqueezy,
  verifyLemonSqueezySignature,
  webhookEventId,
} from "@/modules/plus/domain/webhook-signature";
import { LemonSqueezyProvider } from "@/modules/plus/infrastructure/lemon-squeezy-provider";
import {
  BillingWebhookService,
  WEBHOOK_CLAIM_STALE_MS,
} from "@/modules/plus/services/billing-webhook.service";
import { PlusService } from "@/modules/plus/services/plus.service";
import {
  lsSubscriptionEvent,
  MemorySubscriptions,
  MemoryWebhookEvents,
} from "../support/plus-fakes";

const SECRET = "test-signing-secret-0123456789";
const USER = "a".repeat(24);
const OTHER = "b".repeat(24);
const NOW = new Date("2026-10-23T12:30:00Z");

/** Written independently of the app's helper: Lemon Squeezy's documented algorithm. */
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("hex");

describe("Lemon Squeezy signatures", () => {
  const body = lsSubscriptionEvent();

  it("accepts the HMAC-SHA256 hex digest of the raw body", () => {
    expect(signLemonSqueezy(SECRET, body)).toBe(sign(body));
    expect(verifyLemonSqueezySignature({ secret: SECRET, signature: sign(body), body })).toBe(true);
    // Hex case doesn't matter.
    expect(
      verifyLemonSqueezySignature({ secret: SECRET, signature: sign(body).toUpperCase(), body }),
    ).toBe(true);
  });

  it.each([
    ["a missing secret", { secret: null, signature: sign(body), body }],
    ["an empty secret", { secret: "", signature: sign(body), body }],
    ["a missing signature", { secret: SECRET, signature: null, body }],
    ["another secret", { secret: SECRET, signature: sign(body, "another-secret-000000"), body }],
    ["a changed body", { secret: SECRET, signature: sign(body), body: `${body} ` }],
    [
      "a re-serialised body",
      { secret: SECRET, signature: sign(body), body: JSON.stringify(JSON.parse(body), null, 2) },
    ],
    ["a truncated signature", { secret: SECRET, signature: sign(body).slice(0, 63), body }],
    ["a non-hex signature", { secret: SECRET, signature: "z".repeat(64), body }],
    [
      "a base64 signature",
      {
        secret: SECRET,
        signature: createHmac("sha256", SECRET).update(body).digest("base64"),
        body,
      },
    ],
  ])("refuses %s", (_name, input) => {
    expect(verifyLemonSqueezySignature(input)).toBe(false);
  });

  it("identifies an event by its body, so a retry or replay has the same id", () => {
    expect(webhookEventId("lemonsqueezy", body)).toBe(webhookEventId("lemonsqueezy", body));
    expect(webhookEventId("lemonsqueezy", body)).not.toBe(
      webhookEventId("lemonsqueezy", lsSubscriptionEvent({ status: "cancelled" })),
    );
  });
});

function provider(over: Partial<ConstructorParameters<typeof LemonSqueezyProvider>[0]> = {}) {
  return new LemonSqueezyProvider({
    webhookSecret: SECRET,
    checkoutUrls: {
      monthly: "https://dd.lemonsqueezy.com/buy/monthly-uuid",
      yearly: "https://dd.lemonsqueezy.com/buy/yearly-uuid?media=0",
    },
    storeUrl: null,
    variantIds: { monthly: "501", yearly: "502" },
    testMode: false,
    ...over,
  });
}

describe("LemonSqueezyProvider", () => {
  it("adds our user id as checkout custom data", () => {
    const url = new URL(provider().checkoutUrl("yearly", USER)!);
    expect(url.origin + url.pathname).toBe("https://dd.lemonsqueezy.com/buy/yearly-uuid");
    expect(url.searchParams.get("checkout[custom][user_id]")).toBe(USER);
    expect(url.searchParams.get("media")).toBe("0");
    expect(provider().checkoutUrl("monthly", "not-an-id")).toBeNull();
    expect(provider({ checkoutUrls: { monthly: "https://x.test/m" } }).plans).toEqual(["monthly"]);
  });

  it("knows the generic portal from the store or checkout origin", () => {
    expect(provider().portalUrl).toBe("https://dd.lemonsqueezy.com/billing");
    expect(provider({ storeUrl: "https://shop.example.com/" }).portalUrl).toBe(
      "https://shop.example.com/billing",
    );
  });

  it("parses subscription events and never keeps the customer's name or email", () => {
    const event = provider().parse(
      lsSubscriptionEvent({ status: "cancelled", endsAt: "2026-11-23T12:00:00.000000Z" }),
    );
    expect(event).toMatchObject({
      kind: "subscription",
      eventName: "subscription_created",
      snapshot: {
        subscriptionId: "1001",
        userId: USER,
        status: "cancelled",
        plan: "monthly",
        variantId: "501",
        customerId: "77",
        endsAt: new Date("2026-11-23T12:00:00Z"),
        providerUpdatedAt: new Date("2026-10-23T12:00:00Z"),
        portalUrl: "https://dd.lemonsqueezy.com/billing?signed=1",
      },
    });
    expect(JSON.stringify(event)).not.toContain("someone@example.com");
  });

  it("drops custom data that isn't one of our user ids", () => {
    const event = provider().parse(lsSubscriptionEvent({ userId: "../../etc" }));
    expect(event?.kind === "subscription" && event.snapshot.userId).toBeNull();
  });

  it("returns null for bodies it doesn't understand, and 'other' for non-subscription events", () => {
    expect(provider().parse("not json")).toBeNull();
    expect(provider().parse(JSON.stringify({ meta: {}, data: {} }))).toBeNull();
    expect(provider().parse(lsSubscriptionEvent({ status: "weird" }))).toBeNull();
    const invoice = JSON.stringify({
      meta: { event_name: "subscription_payment_failed", custom_data: { user_id: USER } },
      data: { type: "subscription-invoices", id: "9", attributes: { subscription_id: 1001 } },
    });
    expect(provider().parse(invoice)).toMatchObject({
      kind: "other",
      subscriptionId: "1001",
      userId: USER,
    });
  });
});

function setup(opts: { configured?: boolean; testMode?: boolean } = {}) {
  const subscriptions = new MemorySubscriptions();
  const events = new MemoryWebhookEvents();
  const logger = { info: vi.fn(), warn: vi.fn() };
  const users = {
    byId: vi.fn(async (id: string) =>
      id === USER || id === OTHER ? { id, accountId32: id === USER ? 1 : 2 } : null,
    ),
  };
  const p = opts.configured === false ? null : provider({ testMode: opts.testMode ?? false });
  const alerts = { raise: vi.fn(async (_alert: unknown) => null) };
  const webhooks = new BillingWebhookService({
    provider: p,
    subscriptions,
    events,
    users,
    logger,
    alerts,
    now: () => NOW,
  });
  const plus = new PlusService({
    subscriptions,
    events,
    provider: p,
    enabled: () => true,
    logger,
    now: () => NOW,
  });
  const deliver = (body: string, signature = sign(body)) =>
    webhooks.receive({
      body,
      header: (name) => (name.toLowerCase() === "x-signature" ? signature : null),
    });
  return { subscriptions, events, logger, users, webhooks, plus, deliver, alerts };
}

describe("BillingWebhookService", () => {
  it("doesn't exist (404) without a provider", async () => {
    const { deliver } = setup({ configured: false });
    await expect(deliver(lsSubscriptionEvent())).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a bad signature before parsing anything (401)", async () => {
    const { deliver, subscriptions, events } = setup();
    await expect(deliver("{not json", "0".repeat(64))).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(deliver(lsSubscriptionEvent(), "")).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(subscriptions.docs.size).toBe(0);
    expect(events.events.size).toBe(0);
  });

  it("refuses a signed body that isn't an event (400)", async () => {
    const { deliver } = setup();
    await expect(deliver("{}")).rejects.toMatchObject({ code: "bad_request" });
  });

  it("activates Plus for the linked user", async () => {
    const { deliver, plus } = setup();
    expect(await deliver(lsSubscriptionEvent())).toEqual({ outcome: "applied" });
    expect(await plus.isPlus(USER)).toBe(true);
    expect(await plus.isPlus(OTHER)).toBe(false);
    expect([...(await plus.supporters([1, 2]))]).toEqual([1]);
  });

  it("treats a replayed delivery as a no-op", async () => {
    const { deliver, subscriptions } = setup();
    const created = lsSubscriptionEvent();
    await deliver(created);
    const cancelled = lsSubscriptionEvent({
      event: "subscription_cancelled",
      status: "cancelled",
      endsAt: "2026-11-23T12:00:00.000000Z",
      updatedAt: "2026-10-23T12:10:00.000000Z",
    });
    await deliver(cancelled);
    // An attacker (or a retry) resending the first, validly signed, body changes nothing.
    expect(await deliver(created)).toEqual({ outcome: "duplicate" });
    expect([...subscriptions.docs.values()][0].status).toBe("cancelled");
  });

  it("tells the owner about a refund, which doesn't end Plus by itself", async () => {
    const { deliver, alerts, plus } = setup();
    await deliver(lsSubscriptionEvent());
    const refund = JSON.stringify({
      meta: { event_name: "subscription_payment_refunded", custom_data: { user_id: USER } },
      data: { type: "subscription-invoices", id: "77", attributes: { subscription_id: 1001 } },
    });
    expect(await deliver(refund)).toEqual({ outcome: "ignored" });
    expect(alerts.raise).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "plus_refund",
        vars: { event: "subscription_payment_refunded", subscription: "1001" },
      }),
    );
    expect(await plus.isPlus(USER)).toBe(true);
    // A failing alert never fails the webhook.
    alerts.raise.mockRejectedValueOnce(new Error("push down"));
    const again = refund.replace('"77"', '"78"');
    expect(await deliver(again)).toEqual({ outcome: "ignored" });
    // Other non-subscription events raise nothing.
    alerts.raise.mockClear();
    await deliver(
      refund
        .replace("subscription_payment_refunded", "subscription_payment_success")
        .replace('"77"', '"79"'),
    );
    expect(alerts.raise).not.toHaveBeenCalled();
  });

  it("makes the provider retry while another delivery is still handling the event", async () => {
    const { deliver, events, plus } = setup();
    const created = lsSubscriptionEvent();
    const id = `lemonsqueezy:${createHash("sha256").update(created).digest("hex")}`;
    // A slow first delivery is still working on it: acknowledging would lose the event.
    events.events.set(id, {
      outcome: "processing",
      userId: USER,
      claimedAt: new Date(NOW.getTime() - 30_000),
    });
    await expect(deliver(created)).rejects.toMatchObject({ code: "conflict" });
    expect(await plus.isPlus(USER)).toBe(false);
    // That delivery died: once its claim is stale, the next one applies the event.
    events.events.set(id, {
      outcome: "processing",
      userId: USER,
      claimedAt: new Date(NOW.getTime() - WEBHOOK_CLAIM_STALE_MS - 1),
    });
    expect(await deliver(created)).toEqual({ outcome: "applied" });
    expect(await plus.isPlus(USER)).toBe(true);
  });

  it("ignores an older event that arrives after a newer one", async () => {
    const { deliver, subscriptions, plus } = setup();
    await deliver(
      lsSubscriptionEvent({
        event: "subscription_expired",
        status: "expired",
        updatedAt: "2026-10-23T12:20:00.000000Z",
      }),
    );
    const late = lsSubscriptionEvent({
      event: "subscription_updated",
      status: "active",
      updatedAt: "2026-10-23T12:00:00.000000Z",
    });
    expect(await deliver(late)).toEqual({ outcome: "stale" });
    expect([...subscriptions.docs.values()][0].status).toBe("expired");
    expect(await plus.isPlus(USER)).toBe(false);
  });

  it("keeps Plus until the period end after a cancellation", async () => {
    const { deliver, plus } = setup();
    await deliver(lsSubscriptionEvent());
    await deliver(
      lsSubscriptionEvent({
        event: "subscription_cancelled",
        status: "cancelled",
        endsAt: "2026-11-23T12:00:00.000000Z",
        updatedAt: "2026-10-23T12:05:00.000000Z",
      }),
    );
    expect(await plus.plan(USER)).toMatchObject({
      plus: true,
      reason: "cancelled_until_period_end",
      until: "2026-11-23T12:00:00.000Z",
      stillBills: false,
    });
  });

  it("stores a subscription for an unknown or missing user as unlinked, and acknowledges it", async () => {
    const { deliver, subscriptions, logger, plus } = setup();
    expect(await deliver(lsSubscriptionEvent({ userId: "c".repeat(24) }))).toEqual({
      outcome: "unlinked",
    });
    expect(await deliver(lsSubscriptionEvent({ id: "2002", userId: null }))).toEqual({
      outcome: "unlinked",
    });
    expect([...subscriptions.docs.values()].every((s) => s.userId === null)).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith("billing_subscription_unlinked", expect.anything());
    expect(await plus.adminCounts()).toMatchObject({ unlinked: 2, entitled: 0 });
  });

  it("ignores test-mode events on a live deployment and the other way round", async () => {
    const live = setup();
    expect(await live.deliver(lsSubscriptionEvent({ testMode: true }))).toEqual({
      outcome: "mode_mismatch",
    });
    expect(await live.plus.isPlus(USER)).toBe(false);
    const test = setup({ testMode: true });
    expect(await test.deliver(lsSubscriptionEvent({ testMode: true }))).toEqual({
      outcome: "applied",
    });
  });

  it("acknowledges other events without changing state", async () => {
    const { deliver, subscriptions } = setup();
    const order = JSON.stringify({
      meta: { event_name: "order_created", custom_data: { user_id: USER } },
      data: { type: "orders", id: "5", attributes: {} },
    });
    expect(await deliver(order)).toEqual({ outcome: "ignored" });
    expect(subscriptions.docs.size).toBe(0);
  });

  it("releases the claim when handling fails, so the provider's retry is handled", async () => {
    const { deliver, subscriptions, events } = setup();
    const body = lsSubscriptionEvent();
    const spy = vi
      .spyOn(subscriptions, "upsertIfNewer")
      .mockRejectedValueOnce(new Error("db down"));
    await expect(deliver(body)).rejects.toThrow("db down");
    expect(events.events.size).toBe(0);
    spy.mockRestore();
    expect(await deliver(body)).toEqual({ outcome: "applied" });
  });
});

describe("PlusService", () => {
  it("doubles caps for Plus players only, and falls back to the free cap on errors", async () => {
    const { deliver, plus, subscriptions } = setup();
    await deliver(lsSubscriptionEvent());
    expect(await plus.limit(USER, 100)).toBe(200);
    expect(await plus.limit(OTHER, 100)).toBe(100);
    vi.spyOn(subscriptions, "forUser").mockRejectedValueOnce(new Error("db down"));
    expect(await plus.limit(USER, 100)).toBe(100);
  });

  it("counts only its own mode's subscriptions (staging and production share a database)", async () => {
    // Staging (test mode) receives a test purchase: Plus there.
    const staging = setup({ testMode: true });
    expect(await staging.deliver(lsSubscriptionEvent({ testMode: true }))).toMatchObject({
      outcome: "applied",
    });
    expect(await staging.plus.isPlus(USER)).toBe(true);

    // Production (live mode) reads the same records: the test purchase grants nothing.
    const live = new PlusService({
      subscriptions: staging.subscriptions,
      events: staging.events,
      provider: provider({ testMode: false }),
      enabled: () => true,
      logger: staging.logger,
      now: () => NOW,
    });
    expect(await live.isPlus(USER)).toBe(false);
    expect(await live.limit(USER, 100)).toBe(100);
    expect([...(await live.supporters([1]))]).toEqual([]);
    expect(await live.plusUserIds()).toEqual([]);
    expect(await live.plan(USER)).toMatchObject({ plus: false, canManage: false });
    await expect(live.portalUrl(USER)).rejects.toThrow();
    expect(await live.adminCounts()).toMatchObject({ byStatus: [], unlinked: 0, entitled: 0 });
    expect((await staging.plus.adminCounts()).byStatus).toEqual([{ status: "active", count: 1 }]);
  });

  it("is off (coming soon) without a provider and paused by the kill switch", async () => {
    const subscriptions = new MemorySubscriptions();
    const events = new MemoryWebhookEvents();
    const logger = { warn: vi.fn() };
    const off = new PlusService({
      subscriptions,
      events,
      provider: null,
      enabled: () => true,
      logger,
    });
    expect(off.offer()).toEqual({ status: "off", plans: [] });
    let enabled = true;
    const svc = new PlusService({
      subscriptions,
      events,
      provider: provider(),
      enabled: () => enabled,
      logger,
      now: () => NOW,
    });
    expect(svc.offer()).toEqual({ status: "available", plans: ["monthly", "yearly"] });
    const webhooks = new BillingWebhookService({
      provider: provider(),
      subscriptions,
      events,
      users: { byId: async (id) => ({ id, accountId32: 1 }) },
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => NOW,
    });
    const body = lsSubscriptionEvent();
    await webhooks.receive({ body, header: () => sign(body) });
    expect(await svc.isPlus(USER)).toBe(true);
    enabled = false;
    expect(svc.offer().status).toBe("paused");
    expect(await svc.isPlus(USER)).toBe(false);
    expect(await svc.plusUserIds()).toEqual([]);
    expect(await svc.limit(USER, 5)).toBe(5);
    // The data is kept: switching back restores it.
    enabled = true;
    expect(await svc.isPlus(USER)).toBe(true);
    // Billing stays manageable with the kill switch on.
    enabled = false;
    await expect(svc.portalUrl(USER)).resolves.toContain("lemonsqueezy.com");
  });

  it("refuses checkout when not on sale or already subscribed", async () => {
    const { deliver, plus } = setup();
    const url = await plus.checkoutUrl(OTHER, "monthly");
    expect(new URL(url).searchParams.get("checkout[custom][user_id]")).toBe(OTHER);
    await deliver(lsSubscriptionEvent());
    await expect(plus.checkoutUrl(USER, "monthly")).rejects.toMatchObject({ code: "conflict" });
    const { plus: off } = setup({ configured: false });
    await expect(off.checkoutUrl(USER, "monthly")).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a second checkout while a subscription can still charge (no double billing)", async () => {
    const { deliver, plus } = setup();
    // Paused: no Plus, but the subscription resumes billing later.
    await deliver(lsSubscriptionEvent({ event: "subscription_paused", status: "paused" }));
    expect(await plus.isPlus(USER)).toBe(false);
    expect(await plus.plan(USER)).toMatchObject({ plus: false, stillBills: true });
    await expect(plus.checkoutUrl(USER, "yearly")).rejects.toMatchObject({
      code: "conflict",
      details: { reason: "still_billing" },
    });
    // Once it has expired, buying again is fine.
    await deliver(
      lsSubscriptionEvent({
        event: "subscription_expired",
        status: "expired",
        updatedAt: "2026-10-23T12:20:00.000000Z",
      }),
    );
    await expect(plus.checkoutUrl(USER, "yearly")).resolves.toContain("checkout");
  });

  it("uses the fresh signed portal link, else the store's portal", async () => {
    const { deliver, plus, subscriptions } = setup();
    await expect(plus.portalUrl(USER)).rejects.toMatchObject({ code: "not_found" });
    await deliver(lsSubscriptionEvent());
    expect(await plus.portalUrl(USER)).toBe("https://dd.lemonsqueezy.com/billing?signed=1");
    const [sub] = [...subscriptions.docs.values()];
    sub.portalUrlAt = new Date(NOW.getTime() - 24 * 3_600_000);
    expect(await plus.portalUrl(USER)).toBe("https://dd.lemonsqueezy.com/billing");
  });

  it("exports and deletes the local subscription data only", async () => {
    const { deliver, plus } = setup();
    await deliver(lsSubscriptionEvent());
    const owner = { userId: USER, accountId32: 1 };
    const exported = await plus.exportMyData(owner);
    expect(exported.plusSubscriptions).toHaveLength(1);
    expect(exported.plusBillingNote).toMatch(/payment provider/);
    expect(await plus.deleteMyData(owner)).toEqual({ plusSubscriptions: 1, plusBillingEvents: 1 });
    expect(await plus.isPlus(USER)).toBe(false);
  });

  it("gives admins Plus without a subscription, even while it isn't on sale", async () => {
    const svc = new PlusService({
      subscriptions: new MemorySubscriptions(),
      events: new MemoryWebhookEvents(),
      provider: null,
      enabled: () => false,
      staff: { has: async (id) => id === OTHER, userIds: async () => [OTHER] },
      logger: { warn: vi.fn() },
      now: () => NOW,
    });
    expect(await svc.isPlus(OTHER)).toBe(true);
    expect(await svc.isPlus(USER)).toBe(false);
    expect(await svc.limit(OTHER, 10)).toBe(20);
    expect(await svc.plan(OTHER)).toMatchObject({ plus: true, reason: "staff", canManage: false });
    expect(await svc.plusUserIds()).toEqual([OTHER]);
    // Not a supporter, and not counted as a paying player.
    expect(await svc.supporters([2])).toEqual(new Set());
    expect((await svc.adminCounts()).entitled).toBe(0);
  });
});
