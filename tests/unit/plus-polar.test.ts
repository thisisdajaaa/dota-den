import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  polarWebhookKeys,
  signStandardWebhook,
  verifyPolarSignature,
} from "@/modules/plus/domain/webhook-signature";
import {
  POLAR_API_VERSION,
  PolarApiClient,
  PolarApiError,
} from "@/modules/plus/infrastructure/polar-api-client";
import {
  polarCheckoutRequest,
  PolarProvider,
  polarStatus,
  type PolarConfig,
} from "@/modules/plus/infrastructure/polar-provider";
import {
  polarProductRequest,
  priceInCents,
  provisionPolar,
} from "@/modules/plus/infrastructure/polar-provisioning";
import { BillingWebhookService } from "@/modules/plus/services/billing-webhook.service";
import { PlusService } from "@/modules/plus/services/plus.service";
import {
  MemorySubscriptions,
  MemoryWebhookEvents,
  polarSubscriptionEvent,
} from "../support/plus-fakes";

// A Standard Webhooks secret (whsec_ + base64 of the key), as Polar shows it.
const KEY = Buffer.from("polar-unit-test-signing-key-0001");
const SECRET = `whsec_${KEY.toString("base64")}`;
const USER = "a".repeat(24);
const OTHER = "b".repeat(24);
const NOW = new Date("2026-10-23T12:30:00Z");
const TS = String(Math.floor(NOW.getTime() / 1000));
const MONTHLY = "e7751461-934e-4bbc-befa-2593e1e56dd2";
const YEARLY = "f7ddc56a-88ab-4425-98a4-9d5e951e70bf";

/** Written independently of the app's helper: the Standard Webhooks algorithm. */
function sign(body: string, opts: { id?: string; ts?: string; key?: Buffer } = {}) {
  const id = opts.id ?? "msg_unit_1";
  const ts = opts.ts ?? TS;
  const mac = createHmac("sha256", opts.key ?? KEY)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return { id, ts, signature: `v1,${mac}` };
}

const headers =
  (body: string, opts: Parameters<typeof sign>[1] = {}) =>
  (name: string): string | null => {
    const s = sign(body, opts);
    return (
      { "webhook-id": s.id, "webhook-timestamp": s.ts, "webhook-signature": s.signature }[name] ??
      null
    );
  };

describe("Polar (Standard Webhooks) signatures", () => {
  const body = polarSubscriptionEvent();
  const verify = (over: Partial<Parameters<typeof verifyPolarSignature>[0]> = {}) => {
    const s = sign(body);
    return verifyPolarSignature({
      secret: SECRET,
      id: s.id,
      timestamp: s.ts,
      signature: s.signature,
      body,
      now: NOW,
      ...over,
    });
  };

  it("matches the Standard Webhooks spec's example", () => {
    // From the spec (standard-webhooks/spec/standard-webhooks.md, "Signature scheme").
    const input = {
      secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
      timestamp: "1614265330",
      signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      body: '{"test": 2432232314}',
      now: new Date(1614265330 * 1000),
    };
    expect(verifyPolarSignature(input)).toBe(true);
    expect(verifyPolarSignature({ ...input, body: '{"test": 2432232315}' })).toBe(false);
  });

  it("accepts a correct signature, and the app's own signer agrees", () => {
    expect(verify()).toBe(true);
    expect(signStandardWebhook(KEY, { id: "msg_unit_1", timestamp: TS, body })).toBe(
      sign(body).signature,
    );
  });

  it("also accepts secrets made before 2026-09-08 (key = the whole whsec_ string)", () => {
    const legacy = "whsec_legacy-polar-secret-not-base64!";
    const s = sign(body, { key: Buffer.from(legacy, "utf8") });
    expect(polarWebhookKeys(legacy)).toHaveLength(1);
    expect(
      verifyPolarSignature({
        secret: legacy,
        id: s.id,
        timestamp: s.ts,
        signature: s.signature,
        body,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("accepts any one valid signature among several", () => {
    const good = sign(body).signature;
    const bad = sign(body, { key: Buffer.from("another-key-0000000000000000000") }).signature;
    expect(verify({ signature: `${bad} ${good}` })).toBe(true);
    expect(verify({ signature: `v2,abc ${good}` })).toBe(true);
    expect(verify({ signature: `${bad} ${bad}` })).toBe(false);
  });

  it("accepts a timestamp within 5 minutes either way", () => {
    for (const offset of [-299, 299]) {
      const ts = String(Number(TS) + offset);
      expect(verify({ timestamp: ts, signature: sign(body, { ts }).signature })).toBe(true);
    }
  });

  it.each([
    ["no secret", { secret: null }],
    ["an empty secret", { secret: "" }],
    ["another secret", { secret: `whsec_${Buffer.from("x".repeat(32)).toString("base64")}` }],
    ["a missing id", { id: null }],
    ["a missing timestamp", { timestamp: null }],
    ["a missing signature", { signature: null }],
    ["a tampered body", { body: `${body} ` }],
    ["a re-serialised body", { body: JSON.stringify(JSON.parse(body), null, 2) }],
    ["another id (signature from another message)", { id: "msg_unit_2" }],
    ["a timestamp older than 5 minutes", { timestamp: String(Number(TS) - 301) }],
    ["a timestamp more than 5 minutes ahead", { timestamp: String(Number(TS) + 301) }],
    ["a non-numeric timestamp", { timestamp: "2026-10-23T12:30:00Z" }],
    ["an unversioned signature", { signature: sign(body).signature.slice(3) }],
    ["a v2 signature", { signature: sign(body).signature.replace("v1,", "v2,") }],
    ["a truncated signature", { signature: sign(body).signature.slice(0, 20) }],
    [
      "a hex signature",
      { signature: `v1,${createHmac("sha256", KEY).update(body).digest("hex")}` },
    ],
  ])("refuses %s", (_name, over) => {
    expect(verify(over)).toBe(false);
  });

  it("refuses an old delivery even when its signature is right for its timestamp", () => {
    const ts = String(Number(TS) - 600);
    expect(verify({ timestamp: ts, signature: sign(body, { ts }).signature })).toBe(false);
  });
});

function fakeApi() {
  return {
    createCheckout: vi.fn(async (_body: Record<string, unknown>) => ({
      id: "chk_1",
      url: "https://buy.polar.sh/polar_c_test",
    })),
    createCustomerSession: vi.fn(async (_body: Record<string, unknown>) => ({
      customerPortalUrl: "https://polar.sh/dota-den/portal?customer_session_token=t",
    })),
  };
}

function provider(over: Partial<PolarConfig> = {}) {
  const api = fakeApi();
  return {
    api,
    provider: new PolarProvider({
      webhookSecret: SECRET,
      productIds: { monthly: MONTHLY, yearly: YEARLY },
      organizationSlug: "dota-den",
      server: "production",
      appUrl: "https://www.dota-den.com",
      api,
      now: () => NOW,
      ...over,
    }),
  };
}

describe("PolarProvider: checkout and portal", () => {
  it("builds the checkout request with our user id in metadata and as the external id", () => {
    expect(
      polarCheckoutRequest({
        productId: MONTHLY,
        plan: "monthly",
        userId: USER,
        appUrl: "https://www.dota-den.com/",
        ip: "203.0.113.7",
      }),
    ).toEqual({
      products: [MONTHLY],
      metadata: { user_id: USER, plan: "monthly" },
      external_customer_id: USER,
      success_url: "https://www.dota-den.com/account#plan",
      return_url: "https://www.dota-den.com/plus",
      customer_ip_address: "203.0.113.7",
    });
    // Not an IP: left out.
    expect(
      polarCheckoutRequest({
        productId: MONTHLY,
        plan: "monthly",
        userId: USER,
        appUrl: "https://x.test",
        ip: "unknown",
      }),
    ).not.toHaveProperty("customer_ip_address");
  });

  it("creates a checkout session and answers its URL", async () => {
    const { provider: p, api } = provider();
    expect(await p.checkoutUrl("yearly", USER, { ip: "2001:db8::1" })).toBe(
      "https://buy.polar.sh/polar_c_test",
    );
    expect(api.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ products: [YEARLY], customer_ip_address: "2001:db8::1" }),
    );
  });

  it("offers only plans with a product, and never checks out a non-user id", async () => {
    const { provider: p, api } = provider({ productIds: { monthly: MONTHLY } });
    expect(p.plans).toEqual(["monthly"]);
    expect(await p.checkoutUrl("yearly", USER)).toBeNull();
    expect(await p.checkoutUrl("monthly", "not-an-id")).toBeNull();
    expect(api.createCheckout).not.toHaveBeenCalled();
  });

  it("turns a failed or odd API answer into a message the player can read", async () => {
    const { provider: p, api } = provider();
    api.createCheckout.mockRejectedValueOnce(new PolarApiError("Polar API answered 500", 500));
    await expect(p.checkoutUrl("monthly", USER)).rejects.toMatchObject({
      code: "upstream_unavailable",
      message: expect.stringMatching(/Nothing was charged/),
    });
    api.createCheckout.mockResolvedValueOnce({ id: "x", url: "http://insecure.example/pay" });
    await expect(p.checkoutUrl("monthly", USER)).rejects.toMatchObject({
      code: "upstream_unavailable",
    });
  });

  it("knows the organization's portal on each server, and makes signed-in portal links", async () => {
    expect(provider().provider.portalUrl).toBe("https://polar.sh/dota-den/portal");
    expect(provider({ server: "sandbox" }).provider.portalUrl).toBe(
      "https://sandbox.polar.sh/dota-den/portal",
    );
    const { provider: p, api } = provider();
    expect(await p.customerPortalUrl("cus_1")).toContain("customer_session_token");
    expect(api.createCustomerSession).toHaveBeenCalledWith({
      customer_id: "cus_1",
      return_url: "https://www.dota-den.com/account#plan",
    });
  });

  it("takes sandbox events only on a sandbox deployment", () => {
    expect(provider().provider.testMode).toBe(false);
    expect(provider({ server: "sandbox" }).provider.testMode).toBe(true);
  });
});

describe("PolarProvider: parsing events", () => {
  const { provider: p } = provider();
  const parse = (body: string, id: string | null = "msg_1") =>
    p.parse(body, (n) => (n === "webhook-id" ? id : null));

  it("maps a new subscription and never keeps the customer's name or email", () => {
    const event = parse(polarSubscriptionEvent());
    expect(event).toMatchObject({
      kind: "subscription",
      eventId: "polar:msg_1",
      eventName: "subscription.created",
      testMode: false,
      snapshot: {
        provider: "polar",
        subscriptionId: "5c7c1f2e-0d8f-4f3f-9a54-0a9b6b1c2d3e",
        userId: USER,
        status: "active",
        plan: "monthly",
        variantId: MONTHLY,
        customerId: "9d1b8c4e-3a2f-4e5d-8c7b-6a5f4e3d2c1b",
        renewsAt: new Date("2026-11-23T12:00:00Z"),
        endsAt: null,
        providerUpdatedAt: new Date("2026-10-23T12:00:00Z"),
        portalUrl: null,
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/buyer@example\.com|Some Buyer/);
  });

  it("keys events by webhook-id (kept across retries), else by the body", () => {
    const body = polarSubscriptionEvent();
    expect(parse(body, "msg_2")?.eventId).toBe("polar:msg_2");
    expect(parse(body, null)?.eventId).toMatch(/^polar:[a-f0-9]{64}$/);
    expect(parse(body, "bad id with spaces")?.eventId).toMatch(/^polar:[a-f0-9]{64}$/);
  });

  it("links by checkout metadata, else the customer's external id; drops anything else", () => {
    expect(parse(polarSubscriptionEvent({ userId: null, externalId: OTHER }))).toMatchObject({
      snapshot: { userId: OTHER },
    });
    expect(parse(polarSubscriptionEvent({ userId: "not-ours", externalId: null }))).toMatchObject({
      snapshot: { userId: null },
    });
    expect(parse(polarSubscriptionEvent({ userId: null, externalId: null }))).toMatchObject({
      snapshot: { userId: null },
    });
  });

  it("names the plan by product id, else by the product's metadata", () => {
    const yearly = polarSubscriptionEvent({ productId: YEARLY, productPlan: "yearly" });
    expect(parse(yearly)).toMatchObject({ snapshot: { plan: "yearly" } });
    const unknown = polarSubscriptionEvent({
      productId: "00000000-0000-4000-8000-000000000000",
      productPlan: "yearly",
    });
    expect(parse(unknown)).toMatchObject({ snapshot: { plan: "yearly" } });
    const neither = polarSubscriptionEvent({
      productId: "00000000-0000-4000-8000-000000000000",
      productPlan: "lifetime",
    });
    expect(parse(neither)).toMatchObject({ snapshot: { plan: null } });
  });

  it("uses created_at when modified_at is null", () => {
    expect(parse(polarSubscriptionEvent({ modifiedAt: null }))).toMatchObject({
      snapshot: { providerUpdatedAt: new Date("2026-10-23T12:00:00Z") },
    });
  });

  it.each([
    [
      "subscription.active",
      { status: "active" },
      { status: "active", renewsAt: new Date("2026-11-23T12:00:00Z"), endsAt: null },
    ],
    [
      "subscription.updated (trial)",
      { status: "trialing" },
      { status: "on_trial", renewsAt: new Date("2026-11-23T12:00:00Z") },
    ],
    [
      "subscription.canceled (at period end)",
      { status: "active", cancelAtPeriodEnd: true, endsAt: "2026-11-23T12:00:00.000000Z" },
      { status: "cancelled", renewsAt: null, endsAt: new Date("2026-11-23T12:00:00Z") },
    ],
    [
      "subscription.canceled (no ends_at yet)",
      { status: "active", cancelAtPeriodEnd: true },
      { status: "cancelled", endsAt: new Date("2026-11-23T12:00:00Z") },
    ],
    [
      "subscription.uncanceled",
      { status: "active", cancelAtPeriodEnd: false },
      { status: "active", endsAt: null },
    ],
    [
      "subscription.revoked",
      { status: "canceled", endedAt: "2026-10-23T12:00:00.000000Z" },
      { status: "expired", endsAt: new Date("2026-10-23T12:00:00Z") },
    ],
    [
      "subscription.updated (canceled, still paid up)",
      { status: "canceled", endsAt: "2026-11-23T12:00:00.000000Z" },
      { status: "cancelled", endsAt: new Date("2026-11-23T12:00:00Z") },
    ],
    ["subscription.past_due", { status: "past_due" }, { status: "past_due" }],
    ["subscription.revoked (retries exhausted)", { status: "unpaid" }, { status: "unpaid" }],
    ["subscription.paused", { status: "paused" }, { status: "paused", renewsAt: null }],
    ["subscription.updated (never paid)", { status: "incomplete_expired" }, { status: "expired" }],
  ])("maps %s", (type, opts, want) => {
    const event = parse(polarSubscriptionEvent({ type: type.split(" ")[0], ...opts }));
    expect(event).toMatchObject({ kind: "subscription", snapshot: want });
  });

  it("records a subscription that never started (incomplete) without storing it", () => {
    expect(parse(polarSubscriptionEvent({ status: "incomplete" }))).toMatchObject({
      kind: "other",
      subscriptionId: "5c7c1f2e-0d8f-4f3f-9a54-0a9b6b1c2d3e",
    });
  });

  it("treats order and refund events as 'other', with their subscription and user", () => {
    for (const type of ["order.created", "order.paid", "order.refunded"]) {
      const body = JSON.stringify({
        type,
        timestamp: "2026-10-23T12:00:00.000000Z",
        data: {
          id: "ord_1",
          subscription_id: "sub_9",
          billing_reason: "subscription_create",
          metadata: { user_id: USER },
          customer: { external_id: null, email: "buyer@example.com" },
        },
      });
      expect(parse(body)).toEqual({
        kind: "other",
        eventId: "polar:msg_1",
        eventName: type,
        testMode: false,
        subscriptionId: "sub_9",
        userId: USER,
      });
    }
  });

  it("returns null for bodies it doesn't understand", () => {
    expect(parse("not json")).toBeNull();
    expect(parse(JSON.stringify({ data: {} }))).toBeNull();
    expect(parse(JSON.stringify({ type: "subscription.created", data: { id: "x" } }))).toBeNull();
    expect(
      parse(
        polarSubscriptionEvent().replace(
          '"created_at":"2026-10-23T12:00:00.000000Z"',
          '"created_at":"yesterday"',
        ),
      ),
    ).toBeNull();
  });

  it("verifies with the webhook headers", () => {
    const body = polarSubscriptionEvent();
    expect(p.verify(body, headers(body))).toBe(true);
    expect(
      p.verify(body, headers(body, { key: Buffer.from("nope-nope-nope-nope-nope-nope-00") })),
    ).toBe(false);
    expect(p.verify(body, () => null)).toBe(false);
  });
});

describe("polarStatus", () => {
  const at = new Date("2026-10-23T12:00:00Z");
  const base = {
    cancel_at_period_end: false,
    current_period_end: "2026-11-23T12:00:00.000000Z",
    ends_at: null,
    ended_at: null,
  };
  it("covers every Polar status", () => {
    expect(polarStatus({ ...base, status: "active" }, at)?.status).toBe("active");
    expect(polarStatus({ ...base, status: "trialing" }, at)?.status).toBe("on_trial");
    expect(
      polarStatus({ ...base, status: "trialing", cancel_at_period_end: true }, at)?.status,
    ).toBe("cancelled");
    expect(polarStatus({ ...base, status: "past_due" }, at)?.status).toBe("past_due");
    expect(polarStatus({ ...base, status: "canceled" }, at)?.status).toBe("expired");
    expect(polarStatus({ ...base, status: "unpaid" }, at)?.status).toBe("unpaid");
    expect(polarStatus({ ...base, status: "paused" }, at)?.status).toBe("paused");
    expect(polarStatus({ ...base, status: "incomplete_expired" }, at)?.status).toBe("expired");
    expect(polarStatus({ ...base, status: "incomplete" }, at)).toBeNull();
    expect(polarStatus({ ...base, status: "something_new" }, at)).toBeNull();
  });
});

describe("Polar through the webhook and Plus services", () => {
  function setup() {
    const subscriptions = new MemorySubscriptions();
    const events = new MemoryWebhookEvents();
    const { provider: p, api } = provider();
    const alerts = { raise: vi.fn(async () => {}) };
    const webhooks = new BillingWebhookService({
      provider: p,
      subscriptions,
      events,
      alerts,
      users: { byId: async (id) => (id === USER ? { id, accountId32: 7 } : null) },
      logger: { info: vi.fn(), warn: vi.fn() },
      now: () => NOW,
    });
    const logger = { warn: vi.fn() };
    const plus = new PlusService({
      subscriptions,
      events,
      provider: p,
      enabled: () => true,
      logger,
      now: () => NOW,
    });
    let n = 0;
    const deliver = (body: string, id = `msg_${++n}`) =>
      webhooks.receive({ body, header: headers(body, { id }) });
    return { deliver, plus, api, alerts, subscriptions, logger };
  }

  it("activates, cancels until the period end, and revokes", async () => {
    const { deliver, plus } = setup();
    expect(await deliver(polarSubscriptionEvent())).toEqual({ outcome: "applied" });
    expect(await plus.plan(USER)).toMatchObject({
      plus: true,
      status: "active",
      plan: "monthly",
      canManage: true,
    });
    const canceled = polarSubscriptionEvent({
      type: "subscription.canceled",
      cancelAtPeriodEnd: true,
      endsAt: "2026-11-23T12:00:00.000000Z",
      modifiedAt: "2026-10-23T12:10:00.000000Z",
    });
    expect(await deliver(canceled)).toEqual({ outcome: "applied" });
    expect(await plus.entitlement(USER)).toMatchObject({
      plus: true,
      reason: "cancelled_until_period_end",
      until: new Date("2026-11-23T12:00:00Z"),
    });
    // The subscription.updated that comes with it carries the same object: no change.
    const updated = canceled.replace('"subscription.canceled"', '"subscription.updated"');
    expect(await deliver(updated)).toEqual({ outcome: "applied" });
    const revoked = polarSubscriptionEvent({
      type: "subscription.revoked",
      status: "canceled",
      endedAt: "2026-10-23T12:20:00.000000Z",
      modifiedAt: "2026-10-23T12:20:00.000000Z",
    });
    expect(await deliver(revoked)).toEqual({ outcome: "applied" });
    expect(await plus.plan(USER)).toMatchObject({ plus: false, status: "expired" });
  });

  it("treats a retried delivery (same webhook-id) as a duplicate", async () => {
    const { deliver } = setup();
    const body = polarSubscriptionEvent();
    expect(await deliver(body, "msg_same")).toEqual({ outcome: "applied" });
    expect(await deliver(body, "msg_same")).toEqual({ outcome: "duplicate" });
  });

  it("ignores an older update that arrives after a newer one", async () => {
    const { deliver, plus } = setup();
    await deliver(
      polarSubscriptionEvent({
        type: "subscription.revoked",
        status: "canceled",
        endedAt: "2026-10-23T12:20:00.000000Z",
        modifiedAt: "2026-10-23T12:20:00.000000Z",
      }),
    );
    const late = polarSubscriptionEvent({
      type: "subscription.updated",
      modifiedAt: "2026-10-23T12:05:00.000000Z",
    });
    expect(await deliver(late)).toEqual({ outcome: "stale" });
    expect(await plus.isPlus(USER)).toBe(false);
  });

  it("stores a purchase without one of our user ids as unlinked", async () => {
    const { deliver } = setup();
    expect(await deliver(polarSubscriptionEvent({ userId: OTHER }))).toEqual({
      outcome: "unlinked",
    });
  });

  it("alerts the owner about a refund, which doesn't end Plus by itself", async () => {
    const { deliver, alerts, plus } = setup();
    await deliver(polarSubscriptionEvent());
    const refund = JSON.stringify({
      type: "order.refunded",
      data: { id: "ord_1", subscription_id: "5c7c1f2e-0d8f-4f3f-9a54-0a9b6b1c2d3e" },
    });
    expect(await deliver(refund)).toEqual({ outcome: "ignored" });
    expect(alerts.raise).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "plus_refund",
        vars: expect.objectContaining({ event: "order.refunded" }),
      }),
    );
    expect(await plus.isPlus(USER)).toBe(true);
  });

  it("checks out through the API with the player's id", async () => {
    const { plus, api } = setup();
    expect(await plus.checkoutUrl(USER, "monthly", { ip: "203.0.113.9" })).toBe(
      "https://buy.polar.sh/polar_c_test",
    );
    expect(api.createCheckout.mock.calls[0][0]).toMatchObject({
      metadata: { user_id: USER },
      external_customer_id: USER,
    });
  });

  it("opens a signed-in portal session, else the organization's portal", async () => {
    const { deliver, plus, api, logger } = setup();
    await expect(plus.portalUrl(USER)).rejects.toMatchObject({ code: "not_found" });
    await deliver(polarSubscriptionEvent());
    expect(await plus.portalUrl(USER)).toContain("customer_session_token");
    expect(api.createCustomerSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: "9d1b8c4e-3a2f-4e5d-8c7b-6a5f4e3d2c1b" }),
    );
    api.createCustomerSession.mockRejectedValueOnce(new PolarApiError("timed out", null));
    expect(await plus.portalUrl(USER)).toBe("https://polar.sh/dota-den/portal");
    expect(logger.warn).toHaveBeenCalledWith("plus_portal_session_failed", expect.anything());
  });
});

describe("PolarApiClient", () => {
  const ok = (json: unknown, status = 201) =>
    new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });

  it("pins the API version and sends the token to the chosen server", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      ok({ id: "chk_1", url: "https://buy.polar.sh/c" }),
    );
    const client = new PolarApiClient({
      accessToken: "polar_oat_test_token_0001",
      server: "sandbox",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(await client.createCheckout({ products: [MONTHLY] })).toEqual({
      id: "chk_1",
      url: "https://buy.polar.sh/c",
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      authorization: "Bearer polar_oat_test_token_0001",
      "polar-version": POLAR_API_VERSION,
    });
    expect(JSON.parse(String(init?.body))).toEqual({ products: [MONTHLY] });
  });

  it("uses the production API by default and a base URL override when given", async () => {
    const fetch = vi.fn(async () => ok({ customer_portal_url: "https://polar.sh/x/portal" }));
    const prod = new PolarApiClient({
      accessToken: "t".repeat(20),
      server: "production",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await prod.createCustomerSession({ customer_id: "c" });
    expect(fetch.mock.calls[0]).toContain("https://api.polar.sh/v1/customer-sessions/");
    const local = new PolarApiClient({
      accessToken: "t".repeat(20),
      server: "production",
      baseUrl: "http://localhost:9/polar/",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    await local.createCustomerSession({ customer_id: "c" });
    expect(fetch.mock.calls[1]).toContain("http://localhost:9/polar/v1/customer-sessions/");
  });

  it("maps errors without echoing the response or the token", async () => {
    const token = "polar_oat_secret_value_0001";
    const failing = (impl: () => Promise<Response>) =>
      new PolarApiClient({
        accessToken: token,
        server: "production",
        fetch: vi.fn(impl) as unknown as typeof globalThis.fetch,
      });
    const err422 = await failing(async () => ok({ detail: [{ msg: token }] }, 422))
      .createCheckout({})
      .catch((e: unknown) => e);
    expect(err422).toBeInstanceOf(PolarApiError);
    expect(err422).toMatchObject({ status: 422 });
    expect(String((err422 as Error).message)).not.toContain(token);
    const timeout = await failing(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    })
      .createCheckout({})
      .catch((e: unknown) => e);
    expect(timeout).toMatchObject({ status: null, message: "Polar API timed out" });
    const odd = await failing(async () => ok({ nope: true }))
      .createCheckout({})
      .catch((e: unknown) => e);
    expect(odd).toMatchObject({ message: "Unexpected Polar API response" });
  });
});

describe("Polar provisioning", () => {
  const URL_ = "https://www.dota-den.com/api/v1/plus/webhook";

  /** A fake Polar API holding products and webhook endpoints. */
  function fakePolar(state: {
    products?: Record<string, unknown>[];
    endpoints?: Record<string, unknown>[];
  }) {
    const products = state.products ?? [];
    const endpoints = state.endpoints ?? [];
    const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
    const api = {
      request: vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
        calls.push({ method, path, body });
        if (method === "GET" && path.startsWith("/v1/products/"))
          return { items: products, pagination: { total_count: products.length, max_page: 1 } };
        if (method === "GET" && path.startsWith("/v1/webhooks/endpoints"))
          return { items: endpoints, pagination: { total_count: endpoints.length, max_page: 1 } };
        if (method === "POST" && path === "/v1/products/") {
          const p = { id: `prod_${products.length + 1}`, is_recurring: true, ...body };
          products.push(p);
          return p;
        }
        if (method === "POST" && path === "/v1/webhooks/endpoints") {
          const e = { id: "wh_1", secret: "whsec_brand_new_secret_value", enabled: true, ...body };
          endpoints.push(e);
          return e;
        }
        if (method === "PATCH") return { id: path.split("/").pop(), ...body };
        throw new Error(`unexpected ${method} ${path}`);
      }),
    };
    return { api, calls };
  }

  const existingProducts = () => [
    {
      id: "e7751461-934e-4bbc-befa-2593e1e56dd2",
      name: "Dota Den Plus (monthly)",
      is_recurring: true,
      recurring_interval: "month",
      metadata: { plan: "monthly" },
      prices: [{ amount_type: "fixed", price_currency: "php", price_amount: 14900 }],
    },
    {
      id: "f7ddc56a-88ab-4425-98a4-9d5e951e70bf",
      name: "Something renamed",
      is_recurring: true,
      recurring_interval: "year",
      metadata: { plan: "yearly" },
      prices: [{ amount_type: "fixed", price_currency: "php", price_amount: 149000 }],
    },
  ];

  it("prices the products from PLAN_PRICES, in PHP cents", () => {
    expect(priceInCents("₱149")).toBe(14900);
    expect(priceInCents("₱1,490")).toBe(149000);
    expect(polarProductRequest("yearly")).toMatchObject({
      name: "Dota Den Plus (yearly)",
      recurring_interval: "year",
      prices: [{ amount_type: "fixed", price_currency: "php", price_amount: 149000 }],
      metadata: { plan: "yearly" },
    });
  });

  it("changes nothing in a dry run", async () => {
    const { api, calls } = fakePolar({});
    const log: string[] = [];
    const result = await provisionPolar({
      api,
      apply: false,
      webhookUrl: URL_,
      log: (l) => log.push(l),
    });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(result).toEqual({ productIds: {}, webhookEndpointId: null, secretSaved: false });
    expect(log.join("\n")).toMatch(/would create/);
  });

  it("creates what's missing with --apply and hands the new secret only to saveSecret", async () => {
    const { api, calls } = fakePolar({});
    const log: string[] = [];
    const saveSecret = vi.fn(async () => {});
    const result = await provisionPolar({
      api,
      apply: true,
      webhookUrl: URL_,
      log: (l) => log.push(l),
      saveSecret,
    });
    expect(result).toEqual({
      productIds: { monthly: "prod_1", yearly: "prod_2" },
      webhookEndpointId: "wh_1",
      secretSaved: true,
    });
    expect(saveSecret).toHaveBeenCalledWith("whsec_brand_new_secret_value");
    expect(log.join("\n")).not.toContain("whsec_");
    const hook = calls.find((c) => c.path === "/v1/webhooks/endpoints" && c.method === "POST");
    expect(hook?.body).toMatchObject({
      url: URL_,
      format: "raw",
      api_version: POLAR_API_VERSION,
      events: expect.arrayContaining([
        "subscription.updated",
        "subscription.revoked",
        "order.refunded",
      ]),
    });
    // Running it again finds everything and creates nothing.
    calls.length = 0;
    const again = await provisionPolar({ api, apply: true, webhookUrl: URL_, log: () => {} });
    expect(again.productIds).toEqual(result.productIds);
    expect(again.webhookEndpointId).toBe("wh_1");
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("reuses the products and endpoint that already exist, adding only missing events", async () => {
    const { api, calls } = fakePolar({
      products: existingProducts(),
      endpoints: [
        {
          id: "wh_existing",
          url: `${URL_}/`,
          format: "raw",
          enabled: true,
          api_version: POLAR_API_VERSION,
          events: ["subscription.updated"],
        },
      ],
    });
    const log: string[] = [];
    const result = await provisionPolar({
      api,
      apply: true,
      webhookUrl: URL_,
      log: (l) => log.push(l),
    });
    expect(result).toEqual({
      productIds: {
        monthly: "e7751461-934e-4bbc-befa-2593e1e56dd2",
        yearly: "f7ddc56a-88ab-4425-98a4-9d5e951e70bf",
      },
      webhookEndpointId: "wh_existing",
      secretSaved: false,
    });
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: "PATCH",
      path: "/v1/webhooks/endpoints/wh_existing",
    });
    expect(writes[0].body?.events).toEqual(
      expect.arrayContaining(["subscription.updated", "order.refunded"]),
    );
    expect(log.join("\n")).not.toMatch(/Warning/);
  });

  it("warns, without changing it, when an existing product's price differs", async () => {
    const products = existingProducts();
    (products[0].prices as Record<string, unknown>[])[0].price_amount = 19900;
    const { api, calls } = fakePolar({ products });
    const log: string[] = [];
    await provisionPolar({ api, apply: true, webhookUrl: URL_, log: (l) => log.push(l) });
    expect(log.join("\n")).toMatch(/Warning: it has no fixed php 14900 price/);
    expect(calls.filter((c) => c.path === "/v1/products/" && c.method === "POST")).toEqual([]);
  });
});
