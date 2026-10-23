import { expect, test, type Page } from "@playwright/test";
import { E2E_CRON_SECRET } from "./support/cron";
import { lemonSqueezyHeaders, subscriptionEvent } from "./support/plus-webhook";

// Dota Den Plus with a fake Lemon Squeezy store configured (ADR 0013). Own test identities,
// so subscriptions saved here stay out of other specs.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960461001";
const ALERTS_LOGIN = "/api/v1/auth/steam/login?as=76561197960461002";
/** A push endpoint nothing listens on; one per test (an endpoint belongs to one user). */
const endpoint = (name: string) => `https://127.0.0.1:9/push/e2e-plus-${name}`;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Our user id, read from the checkout redirect (the only place it leaves the server). */
async function checkoutUserId(page: Page): Promise<string> {
  const res = await page.request.get("/api/v1/plus/checkout?plan=monthly", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const to = new URL(res.headers().location);
  expect(to.origin).toBe("https://dota-den-e2e.lemonsqueezy.com");
  const id = to.searchParams.get("checkout[custom][user_id]");
  expect(id).toMatch(/^[a-f0-9]{24}$/);
  return id!;
}

async function deliver(page: Page, body: string, event: string) {
  const res = await page.request.post("/api/v1/plus/webhook", {
    data: body,
    headers: lemonSqueezyHeaders(body, event),
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data.outcome as string;
}

async function saveDevice(page: Page, baseURL: string, name: string) {
  const res = await page.request.put("/api/v1/me/notifications/subscription", {
    data: { endpoint: endpoint(name), keys: { p256dh: "BNcR", auth: "tBHI" } },
    headers: { origin: new URL(baseURL).origin },
  });
  expect(res.status()).toBe(200);
}

test("a signed webhook activates Plus; cancelled keeps it until the period ends", async ({
  page,
  baseURL,
}) => {
  await page.goto(LOGIN);
  await page.goto("/plus");
  await expect(page.getByRole("heading", { level: 1, name: /Dota Den Plus/ })).toBeVisible();
  const monthly = page.getByRole("article", { name: "Monthly" });
  await expect(monthly).toContainText("$3.99");
  await expect(page.getByRole("article", { name: "Yearly" })).toContainText("$29.99");
  await expect(monthly.getByRole("link", { name: /Get Plus monthly/ })).toHaveAttribute(
    "href",
    "/api/v1/plus/checkout?plan=monthly",
  );
  // Listed in the navigation while it's on sale.
  await expect(
    page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Plus" }),
  ).toBeVisible();

  const userId = await checkoutUserId(page);
  await saveDevice(page, baseURL!, "plan");
  const badge = page
    .getByRole("complementary")
    .getByRole("img", { name: "Dota Den Plus supporter" });
  const plan = page.getByRole("region", { name: "Your plan" });
  const alerts = page
    .getByRole("region", { name: "Notifications" })
    .getByRole("checkbox", { name: /Streamer goes live/ });

  // Free: no badge, no go-live alerts to choose.
  await page.goto("/account");
  await expect(plan).toContainText("Free");
  await expect(page.getByRole("checkbox", { name: /Weekly recap/ })).toBeVisible();
  await expect(alerts).toHaveCount(0);
  await expect(badge).toHaveCount(0);

  // Nothing the browser can send grants Plus: an unsigned or wrongly signed event is refused.
  const now = Date.now();
  const created = subscriptionEvent({
    event: "subscription_created",
    subscriptionId: "e2e-sub-1",
    userId,
    status: "active",
    updatedAt: new Date(now - 10 * MINUTE),
    renewsAt: new Date(now + 30 * DAY),
  });
  const unsigned = await page.request.post("/api/v1/plus/webhook", {
    data: created,
    headers: { "content-type": "application/json", origin: new URL(baseURL!).origin },
  });
  expect(unsigned.status()).toBe(401);
  const wrong = await page.request.post("/api/v1/plus/webhook", {
    data: created,
    headers: lemonSqueezyHeaders(created, "subscription_created", "not-the-secret-000000"),
  });
  expect(wrong.status()).toBe(401);

  expect(await deliver(page, created, "subscription_created")).toBe("applied");
  // A retry or replay of the same delivery changes nothing.
  expect(await deliver(page, created, "subscription_created")).toBe("duplicate");

  await page.goto("/account");
  await expect(plan).toContainText("Dota Den Plus");
  await expect(plan.getByRole("status")).toContainText("Renews on");
  await expect(badge).toBeVisible();
  await expect(alerts).toBeChecked();
  await expect(page.getByTestId("plus-delete-warning")).toBeVisible();
  // The billing portal: the signed link from the latest webhook.
  const portal = await page.request.get("/api/v1/me/plus/portal", { maxRedirects: 0 });
  expect(portal.status()).toBe(303);
  expect(portal.headers().location).toContain("https://dota-den-e2e.lemonsqueezy.com/billing");
  // Already subscribed: no second checkout.
  expect(
    (await page.request.get("/api/v1/plus/checkout?plan=yearly", { maxRedirects: 0 })).status(),
  ).toBe(409);
  await page.goto("/plus");
  await expect(page.getByText("You have Plus. Thank you!")).toBeVisible();
  await expect(page.getByRole("link", { name: /Get Plus/ })).toHaveCount(0);

  // Cancelled: Plus stays until the end of the paid period.
  const periodEnd = new Date(now + 20 * DAY);
  const cancelled = subscriptionEvent({
    event: "subscription_cancelled",
    subscriptionId: "e2e-sub-1",
    userId,
    status: "cancelled",
    updatedAt: new Date(now - 5 * MINUTE),
    renewsAt: periodEnd,
    endsAt: periodEnd,
  });
  expect(await deliver(page, cancelled, "subscription_cancelled")).toBe("applied");
  // An older update arriving late is ignored.
  const late = subscriptionEvent({
    event: "subscription_updated",
    subscriptionId: "e2e-sub-1",
    userId,
    status: "active",
    updatedAt: new Date(now - 8 * MINUTE),
    renewsAt: new Date(now + 30 * DAY),
  });
  expect(await deliver(page, late, "subscription_updated")).toBe("stale");

  await page.goto("/account");
  await expect(plan.getByRole("status")).toContainText("Cancelled. You keep Plus until");
  await expect(badge).toBeVisible();
  await expect(page.getByTestId("plus-delete-warning")).toHaveCount(0);

  // "Download your data" has the subscription record, never the buyer's email.
  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.plusSubscriptions).toEqual([
    expect.objectContaining({ id: "lemonsqueezy:e2e-sub-1", status: "cancelled" }),
  ]);
  expect(JSON.stringify(exported)).not.toContain("buyer@e2e.example");

  // Expired: back to free.
  const expired = subscriptionEvent({
    event: "subscription_expired",
    subscriptionId: "e2e-sub-1",
    userId,
    status: "expired",
    updatedAt: new Date(now),
    endsAt: periodEnd,
  });
  expect(await deliver(page, expired, "subscription_expired")).toBe("applied");
  await page.goto("/account");
  await expect(plan.getByRole("status")).toContainText("Your Plus subscription has ended.");
  await expect(badge).toHaveCount(0);
  await expect(alerts).toHaveCount(0);
});

test("go-live alerts check followed channels for Plus players", async ({
  page,
  baseURL,
  request,
}) => {
  await page.goto(ALERTS_LOGIN);
  const userId = await checkoutUserId(page);
  await saveDevice(page, baseURL!, "alerts");
  const followed = await page.request.post("/api/v1/me/streamers", {
    data: {
      platform: "twitch",
      channelId: "9005",
      login: "plusalertcaster",
      displayName: "PlusAlertCaster",
    },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(followed.ok()).toBe(true);
  const body = subscriptionEvent({
    event: "subscription_created",
    subscriptionId: "e2e-sub-alerts",
    userId,
    status: "active",
    updatedAt: new Date(),
    renewsAt: new Date(Date.now() + 30 * DAY),
  });
  expect(await deliver(page, body, "subscription_created")).toBe("applied");

  // The scheduled run (QStash in production; this bearer route for other schedulers).
  expect((await request.get("/api/cron/streamer-alerts")).status()).toBe(401);
  const run = await request.get("/api/cron/streamer-alerts", {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);
  const data = (await run.json()).data;
  // The channel went live two minutes ago. The test device can't be reached, so nothing is
  // delivered (and the claim is released for the next run), but the stream was found.
  expect(data.users).toBeGreaterThanOrEqual(1);
  expect(data.live).toBeGreaterThanOrEqual(1);
  expect(data.failed).toBe(0);
});
