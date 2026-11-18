import { expect, test, type Page } from "@playwright/test";
import { polarHeaders, polarSubscriptionEvent } from "./support/plus-webhook";

// Dota Den Plus with Polar as the payment provider (ADR 0013, Polar addendum), against the
// third app server: a fake Polar API on the fixture server (sandbox mode) and webhooks signed
// with a test secret. Own test identities, so subscriptions saved here stay out of other specs.
const POLAR_URL = process.env.E2E_POLAR_URL ?? "http://localhost:3104";
const FIXTURE = `http://localhost:${process.env.FIXTURE_PORT ?? 3101}`;
test.use({ baseURL: POLAR_URL });

const LOGIN = "/api/v1/auth/steam/login?as=76561197960461201";
const LEGAL_LOGIN = "/api/v1/auth/steam/login?as=76561197960461202";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const startCheckout = (page: Page, plan: "monthly" | "yearly") =>
  page.request.post("/api/v1/plus/checkout", { data: { plan }, headers: { origin: POLAR_URL } });

async function deliver(page: Page, body: string, headers = polarHeaders(body)) {
  const res = await page.request.post("/api/v1/plus/webhook", { data: body, headers });
  expect(res.status()).toBe(200);
  return (await res.json()).data.outcome as string;
}

test("Polar: checkout carries our user id; signed webhooks drive the plan", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(LOGIN);
  await page.goto("/plus");
  await expect(page.getByRole("heading", { level: 1, name: /Dota Den Plus/ })).toBeVisible();
  await expect(
    page.getByText(/handled by Polar \(polar\.sh\), acting as merchant of record/),
  ).toBeVisible();

  // The button asks our server for a checkout session, then opens Polar's checkout page.
  await page.route("https://sandbox.polar.sh/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Fake Polar</title>" }),
  );
  const monthly = page.getByRole("article", { name: "Monthly" });
  await expect(monthly).toContainText("₱299");
  await monthly.getByRole("button", { name: /Get Plus monthly/ }).click();
  await expect(page).toHaveURL(/sandbox\.polar\.sh\/checkout\/polar_c_e2e_/);
  const userId = new URL(page.url()).searchParams.get("e2e_user");
  expect(userId).toMatch(/^[a-f0-9]{24}$/);
  // What the app sent Polar: the product, our user id (metadata and external id), our URLs.
  const calls = (await (await page.request.get(`${FIXTURE}/polar/calls`)).json()) as {
    path: string;
    body: Record<string, unknown>;
  }[];
  const call = calls.find(
    (c) =>
      c.path === "/polar/v1/checkouts/" &&
      (c.body.metadata as { user_id?: string }).user_id === userId,
  );
  expect(call?.body).toMatchObject({
    products: ["11111111-1111-4111-8111-111111111111"],
    external_customer_id: userId,
    success_url: `${POLAR_URL}/account#plan`,
    return_url: `${POLAR_URL}/plus`,
  });
  await page.goto("/plus");
  // Another site can't start a checkout for a signed-in player.
  const crossSite = await page.request.post("/api/v1/plus/checkout", {
    data: { plan: "monthly" },
    headers: { origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);

  // Nothing unsigned, wrongly signed or old is accepted.
  const now = Date.now();
  const subscriptionId = "0a0a0a0a-1111-4222-8333-e2e000000001";
  const created = polarSubscriptionEvent({
    type: "subscription.created",
    subscriptionId,
    userId: userId!,
    status: "active",
    modifiedAt: new Date(now - 10 * MINUTE),
    periodEnd: new Date(now + 30 * DAY),
  });
  const unsigned = await page.request.post("/api/v1/plus/webhook", {
    data: created,
    headers: { "content-type": "application/json", origin: POLAR_URL },
  });
  expect(unsigned.status()).toBe(401);
  const wrongKey = await page.request.post("/api/v1/plus/webhook", {
    data: created,
    headers: polarHeaders(created, { key: Buffer.from("not-the-e2e-polar-key-000000000000") }),
  });
  expect(wrongKey.status()).toBe(401);
  const old = await page.request.post("/api/v1/plus/webhook", {
    data: created,
    headers: polarHeaders(created, { timestamp: Math.floor(now / 1000) - 10 * 60 }),
  });
  expect(old.status()).toBe(401);
  const tampered = polarHeaders(created);
  const forged = await page.request.post("/api/v1/plus/webhook", {
    data: created.replace('"status":"active"', '"status":"trialing"'),
    headers: tampered,
  });
  expect(forged.status()).toBe(401);

  // Signed: applied once; a retry with the same webhook-id is a duplicate.
  const first = polarHeaders(created);
  expect(await deliver(page, created, first)).toBe("applied");
  expect(
    await deliver(page, created, { ...polarHeaders(created, { id: first["webhook-id"] }) }),
  ).toBe("duplicate");
  // An order event is recorded and acknowledged.
  const order = JSON.stringify({
    type: "order.paid",
    timestamp: new Date().toISOString(),
    data: { id: "ord_e2e_1", subscription_id: subscriptionId, metadata: { user_id: userId } },
  });
  expect(await deliver(page, order)).toBe("ignored");

  const plan = page.getByRole("region", { name: "Your plan" });
  await page.goto("/account");
  await expect(plan).toContainText("Dota Den Plus");
  await expect(plan.getByRole("status")).toContainText("Renews on");
  // The billing portal: a signed-in Polar customer session, made on demand.
  const portal = await page.request.get("/api/v1/me/plus/portal", { maxRedirects: 0 });
  expect(portal.status()).toBe(303);
  expect(portal.headers().location).toContain(
    "https://sandbox.polar.sh/dota-den-e2e/portal?customer_session_token=",
  );
  // Already subscribed: no second checkout.
  expect((await startCheckout(page, "yearly")).status()).toBe(409);

  // Canceled at period end: Polar keeps it active with cancel_at_period_end.
  const periodEnd = new Date(now + 20 * DAY);
  const canceled = polarSubscriptionEvent({
    type: "subscription.canceled",
    subscriptionId,
    userId: userId!,
    status: "active",
    cancelAtPeriodEnd: true,
    endsAt: periodEnd,
    modifiedAt: new Date(now - 5 * MINUTE),
    periodEnd,
  });
  expect(await deliver(page, canceled)).toBe("applied");
  // An older update arriving late is ignored.
  const late = polarSubscriptionEvent({
    type: "subscription.updated",
    subscriptionId,
    userId: userId!,
    status: "active",
    modifiedAt: new Date(now - 8 * MINUTE),
    periodEnd: new Date(now + 30 * DAY),
  });
  expect(await deliver(page, late)).toBe("stale");
  await page.goto("/account");
  await expect(plan.getByRole("status")).toContainText("Cancelled. You keep Plus until");

  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.plusSubscriptions).toEqual([
    expect.objectContaining({ id: `polar:${subscriptionId}`, status: "cancelled" }),
  ]);
  expect(JSON.stringify(exported)).not.toContain("polar-buyer@e2e.example");

  // Revoked (the period ended): back to free.
  const revoked = polarSubscriptionEvent({
    type: "subscription.revoked",
    subscriptionId,
    userId: userId!,
    status: "canceled",
    endedAt: new Date(now),
    modifiedAt: new Date(now),
    periodEnd,
  });
  expect(await deliver(page, revoked)).toBe("applied");
  await page.goto("/account");
  await expect(plan.getByRole("status")).toContainText("Your Plus subscription has ended.");
});

test("Polar: the legal pages name Polar as the merchant of record", async ({ page }) => {
  await page.goto(LEGAL_LOGIN);
  await page.goto("/terms");
  await expect(
    page.getByText(/Plus is sold by Polar \(polar\.sh\), acting as merchant/),
  ).toBeVisible();
  await page.goto("/refunds");
  await expect(page.getByText(/Refunds are paid out by Polar/)).toBeVisible();
  await expect(page.getByText(/within 60 days of purchase/)).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByText(/Polar \(polar\.sh\) sells Plus as merchant of record/),
  ).toBeVisible();
  await expect(page.getByText(/your IP address \(for your country and tax\)/)).toBeVisible();
  await expect(page.getByText(/^Our payment provider sells Plus/)).toHaveCount(0);
});
