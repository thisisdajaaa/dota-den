import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/common/cache/redis", () => ({ getRedis: () => null }));
vi.mock("@/common/config/env", () => ({ env: () => ({ APP_URL: "http://localhost:3000" }) }));
// Signed in when the request carries a session cookie (the real guard reads the session).
vi.mock("@/modules/identity", async () => {
  const { UnauthorizedError } = await import("@/common/errors/app-error");
  return {
    requireUser: async (req: NextRequest) => {
      const id = req.cookies.get("session")?.value;
      if (!id) throw new UnauthorizedError();
      return { id, accountId32: 1 };
    },
  };
});

const { PlusController } = await import("@/modules/plus/plus.controller");
type ReferralService = import("@/modules/plus/services/referral.service").ReferralService;
const { PlusService } = await import("@/modules/plus/services/plus.service");
const { BillingWebhookService } = await import("@/modules/plus/services/billing-webhook.service");
const { LemonSqueezyProvider } =
  await import("@/modules/plus/infrastructure/lemon-squeezy-provider");
const { PolarProvider } = await import("@/modules/plus/infrastructure/polar-provider");
const { lsSubscriptionEvent, MemorySubscriptions, MemoryWebhookEvents } =
  await import("../support/plus-fakes");

const ORIGIN = "http://localhost:3000";
const SECRET = "controller-test-secret-0001";
const USER = "a".repeat(24);

function setup(configured = true) {
  const subscriptions = new MemorySubscriptions();
  const events = new MemoryWebhookEvents();
  const logger = { info: vi.fn(), warn: vi.fn() };
  const provider = configured
    ? new LemonSqueezyProvider({
        webhookSecret: SECRET,
        checkoutUrls: { monthly: "https://dd.lemonsqueezy.com/buy/m" },
        storeUrl: null,
        variantIds: {},
        testMode: false,
      })
    : null;
  const plus = new PlusService({ subscriptions, events, provider, enabled: () => true, logger });
  const webhooks = new BillingWebhookService({
    provider,
    subscriptions,
    events,
    users: { byId: async (id) => (id === USER ? { id, accountId32: 1 } : null) },
    logger,
  });
  return {
    controller: new PlusController({ plus, webhooks, referrals: {} as ReferralService }),
    subscriptions,
  };
}

const get = (path: string, user?: string) =>
  new NextRequest(`${ORIGIN}${path}`, {
    headers: user ? { cookie: `session=${user}` } : {},
  });

const checkout = (body: unknown, user?: string, origin: string | null = ORIGIN) =>
  new NextRequest(`${ORIGIN}/api/v1/plus/checkout`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      ...(user ? { cookie: `session=${user}` } : {}),
    },
  });

const post = (body: string, headers: Record<string, string>) =>
  new NextRequest(`${ORIGIN}/api/v1/plus/webhook`, { method: "POST", body, headers });

describe("PlusController", () => {
  it("checkout needs a signed-in, same-origin player and a valid plan", async () => {
    const { controller } = setup();
    expect((await controller.checkout(checkout({ plan: "monthly" }))).status).toBe(401);
    // Another site can't start a checkout for a signed-in player.
    expect(
      (await controller.checkout(checkout({ plan: "monthly" }, USER, "https://evil.example")))
        .status,
    ).toBe(403);
    expect((await controller.checkout(checkout({ plan: "monthly" }, USER, null))).status).toBe(403);
    expect((await controller.checkout(checkout({ plan: "forever" }, USER))).status).toBe(400);
    // Not offered (no yearly link set up).
    expect((await controller.checkout(checkout({ plan: "yearly" }, USER))).status).toBe(404);
  });

  it("checkout answers the provider's URL with the user id attached on the server", async () => {
    const { controller } = setup();
    const res = await controller.checkout(checkout({ plan: "monthly" }, USER));
    expect(res.status).toBe(200);
    const to = new URL((await res.json()).data.url);
    expect(to.host).toBe("dd.lemonsqueezy.com");
    expect(to.searchParams.get("checkout[custom][user_id]")).toBe(USER);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("with Polar, creates the checkout with the buyer's IP and maps a provider failure to 503", async () => {
    const createCheckout = vi.fn(async (_body: Record<string, unknown>) => ({
      id: "chk_1",
      url: "https://buy.polar.sh/polar_c_1",
    }));
    const provider = new PolarProvider({
      webhookSecret: "whsec_dGVzdC1zZWNyZXQtMDAwMDAwMDAwMDAw",
      productIds: { monthly: "e7751461-934e-4bbc-befa-2593e1e56dd2" },
      organizationSlug: "dota-den",
      server: "production",
      appUrl: ORIGIN,
      api: { createCheckout, createCustomerSession: vi.fn() },
    });
    const subscriptions = new MemorySubscriptions();
    const events = new MemoryWebhookEvents();
    const logger = { info: vi.fn(), warn: vi.fn() };
    const controller = new PlusController({
      plus: new PlusService({ subscriptions, events, provider, enabled: () => true, logger }),
      webhooks: new BillingWebhookService({
        provider,
        subscriptions,
        events,
        users: { byId: async () => null },
        logger,
      }),
      referrals: {} as ReferralService,
    });
    const req = checkout({ plan: "monthly" }, USER);
    req.headers.set("x-forwarded-for", "203.0.113.5, 10.0.0.1");
    const res = await controller.checkout(req);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ url: "https://buy.polar.sh/polar_c_1" });
    expect(createCheckout.mock.calls[0][0]).toMatchObject({
      external_customer_id: USER,
      customer_ip_address: "203.0.113.5",
    });
    createCheckout.mockRejectedValueOnce(new Error("down"));
    const failed = await controller.checkout(checkout({ plan: "monthly" }, USER));
    expect(failed.status).toBe(503);
    expect((await failed.json()).code).toBe("upstream_unavailable");
  });

  it("checkout is 404 when Plus isn't configured", async () => {
    const { controller } = setup(false);
    expect((await controller.checkout(checkout({ plan: "monthly" }, USER))).status).toBe(404);
  });

  it("status and portal need a signed-in player", async () => {
    const { controller } = setup();
    expect((await controller.status(get("/api/v1/me/plus"))).status).toBe(401);
    expect((await controller.portal(get("/api/v1/me/plus/portal"))).status).toBe(401);
    const res = await controller.status(get("/api/v1/me/plus", USER));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ plus: false, status: null });
    // Nothing to manage yet.
    expect((await controller.portal(get("/api/v1/me/plus/portal", USER))).status).toBe(404);
  });

  it("never trusts a client-sent entitlement: only signed webhooks change the plan", async () => {
    const { controller } = setup();
    const forged = lsSubscriptionEvent({ userId: USER });
    // No signature, a wrong one, and a cross-origin browser post: all refused.
    expect((await controller.webhook(post(forged, { origin: ORIGIN }))).status).toBe(401);
    expect((await controller.webhook(post(forged, { "x-signature": "0".repeat(64) }))).status).toBe(
      401,
    );
    const status = await controller.status(get("/api/v1/me/plus", USER));
    expect((await status.json()).data.plus).toBe(false);
  });

  it("webhook takes signed provider calls without a session or Origin", async () => {
    const { controller } = setup();
    // Renews well after today (status is read on the real clock).
    const body = lsSubscriptionEvent({ userId: USER, renewsAt: "2099-01-01T00:00:00.000000Z" });
    const signature = createHmac("sha256", SECRET).update(body).digest("hex");
    const res = await controller.webhook(
      post(body, { "x-signature": signature, "x-event-name": "subscription_created" }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ outcome: "applied" });
    const status = await controller.status(get("/api/v1/me/plus", USER));
    expect((await status.json()).data).toMatchObject({ plus: true, canManage: true });
  });

  it("webhook is 404 without a provider and refuses oversized bodies", async () => {
    expect((await setup(false).controller.webhook(post("{}", {}))).status).toBe(404);
    const big = "x".repeat(300 * 1024);
    expect((await setup().controller.webhook(post(big, { "x-signature": "0" }))).status).toBe(400);
  });
});
