import { expect, test, type Page } from "@playwright/test";
import { attempt, attemptSteamId } from "./support/attempt";
import { E2E_CRON_SECRET } from "./support/cron";
import { lemonSqueezyHeaders, subscriptionEvent } from "./support/plus-webhook";

// Dota Den Plus with a fake Lemon Squeezy store configured (ADR 0013). Own test identities,
// so subscriptions saved here stay out of other specs, and new ones (and subscription ids) on
// a retry: a failed run leaves its player subscribed, and its newer events make a retry's
// events look stale.
const login = (steamId: string) => `/api/v1/auth/steam/login?as=${attemptSteamId(steamId)}`;
const subscription = (name: string) => `e2e-sub-${name}-${attempt()}`;
/** A push endpoint nothing listens on; one per test run (an endpoint belongs to one user). */
const endpoint = (name: string) => `https://127.0.0.1:9/push/e2e-plus-${name}-${attempt()}`;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Starts a checkout like the page does (same-origin POST); answers the response. */
const startCheckout = (page: Page, plan: "monthly" | "yearly", origin?: string | null) =>
  page.request.post("/api/v1/plus/checkout", {
    data: { plan },
    headers: origin === null ? {} : { origin: origin ?? new URL(page.url()).origin },
  });

/** Our user id, read from the checkout URL (the only place it leaves the server). */
async function checkoutUserId(page: Page): Promise<string> {
  const res = await startCheckout(page, "monthly");
  expect(res.status()).toBe(200);
  const to = new URL((await res.json()).data.url);
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
  // A dozen pages and webhook round trips against `next dev`: more than the default 30s on CI.
  test.setTimeout(60_000);
  const subscriptionId = subscription("1");
  await page.goto(login("76561197960461001"));
  await page.goto("/plus");
  await expect(page.getByRole("heading", { level: 1, name: /Dota Den Plus/ })).toBeVisible();
  const monthly = page.getByRole("article", { name: "Monthly" });
  await expect(monthly).toContainText("₱149");
  await expect(page.getByRole("article", { name: "Yearly" })).toContainText("₱1,490");
  await expect(monthly.getByRole("button", { name: /Get Plus monthly/ })).toBeEnabled();
  // The button starts the checkout on our server, then opens the provider's page.
  await page.route("https://dota-den-e2e.lemonsqueezy.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Fake checkout</title>" }),
  );
  await monthly.getByRole("button", { name: /Get Plus monthly/ }).click();
  await expect(page).toHaveURL(/dota-den-e2e\.lemonsqueezy\.com\/buy\/monthly-variant/);
  await page.goto("/plus");
  // Another site can't start a checkout for a signed-in player.
  expect((await startCheckout(page, "monthly", "https://evil.example")).status()).toBe(403);
  expect((await startCheckout(page, "monthly", null)).status()).toBe(403);
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
    subscriptionId,
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
  expect((await startCheckout(page, "yearly")).status()).toBe(409);
  await page.goto("/plus");
  await expect(page.getByText("You have Plus. Thank you!")).toBeVisible();
  await expect(page.getByRole("button", { name: /Get Plus/ })).toHaveCount(0);

  // Cancelled: Plus stays until the end of the paid period.
  const periodEnd = new Date(now + 20 * DAY);
  const cancelled = subscriptionEvent({
    event: "subscription_cancelled",
    subscriptionId,
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
    subscriptionId,
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
    expect.objectContaining({ id: `lemonsqueezy:${subscriptionId}`, status: "cancelled" }),
  ]);
  expect(JSON.stringify(exported)).not.toContain("buyer@e2e.example");

  // Expired: back to free.
  const expired = subscriptionEvent({
    event: "subscription_expired",
    subscriptionId,
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
  await page.goto(login("76561197960461002"));
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
    subscriptionId: subscription("alerts"),
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

test("a new player starts the free 7-day trial once: Plus now, no card, nothing to buy twice", async ({
  page,
}) => {
  await page.goto(login("76561197960461003"));
  await expect(page).toHaveURL(/\/dashboard$/);

  // Free: a Plus page is locked.
  await page.goto("/heroes/splits");
  await expect(page.getByRole("region", { name: "A Plus feature" })).toBeVisible();

  await page.goto("/plus");
  const trial = page.getByRole("region", { name: "Try Plus free for 7 days" });
  await expect(trial).toContainText("No card needed");
  await trial.getByRole("button", { name: "Start free trial" }).click();

  // Reloaded with Plus on: the trial banner with its end date, the plans still offered.
  await expect(page.getByText("Your free trial is on")).toBeVisible();
  await expect(trial).toHaveCount(0);
  await expect(page.getByRole("button", { name: /get plus monthly/i })).toBeVisible();

  await page.goto("/heroes/splits");
  await expect(page.getByRole("region", { name: "A Plus feature" })).toHaveCount(0);
  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Your plan" })).toContainText(
    /Free trial: Plus until .* Nothing is charged/,
  );

  // Once per account: a second start is refused, and a cross-site one never starts.
  const origin = new URL(page.url()).origin;
  expect((await page.request.post("/api/v1/plus/trial", { headers: { origin } })).status()).toBe(
    409,
  );
  expect(
    (
      await page.request.post("/api/v1/plus/trial", { headers: { origin: "https://evil.test" } })
    ).status(),
  ).toBe(403);
  // A trial player can still subscribe (it keeps Plus after the trial).
  expect((await startCheckout(page, "monthly")).status()).toBe(200);
});
