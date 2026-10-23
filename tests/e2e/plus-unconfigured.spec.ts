import { expect, test } from "@playwright/test";
import { lemonSqueezyHeaders } from "./support/plus-webhook";

// Against the second app server, which runs without any billing configuration (a fresh
// deployment): Plus doesn't exist yet (ADR 0013).
const PLAIN_URL = process.env.E2E_PLAIN_URL ?? "http://localhost:3102";
test.use({ baseURL: PLAIN_URL });

const LOGIN = "/api/v1/auth/steam/login?as=76561197960461101";

test("without a payment provider, Plus is 'coming soon' and nothing can be bought", async ({
  page,
}) => {
  await page.goto("/plus");
  await expect(page.getByRole("heading", { name: "Plus is coming soon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Free for everyone, always" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Get Plus|Sign in with Steam to get Plus/ }),
  ).toHaveCount(0);
  await expect(page.getByText("$3.99")).toHaveCount(0);
  // The legal drafts are reachable from the footer.
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "/terms",
  );

  await page.goto(LOGIN);
  await page.goto("/account");
  // Not listed in the navigation, and no plan card.
  await expect(page.getByRole("link", { name: "Plus", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your plan" })).toHaveCount(0);
  expect(
    (await page.request.get("/api/v1/plus/checkout?plan=monthly", { maxRedirects: 0 })).status(),
  ).toBe(404);
});

test("without a payment provider, the webhook doesn't exist", async ({ request }) => {
  const body = JSON.stringify({ meta: { event_name: "subscription_created" }, data: {} });
  const res = await request.post("/api/v1/plus/webhook", {
    data: body,
    headers: lemonSqueezyHeaders(body, "subscription_created"),
  });
  expect(res.status()).toBe(404);
});

test("the terms and refund policy pages render", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
  await expect(page.getByText(/not affiliated with or endorsed by Valve/).first()).toBeVisible();
  await page.goto("/refunds");
  await expect(page.getByRole("heading", { level: 1, name: "Refund policy" })).toBeVisible();
  await expect(page.getByText(/merchant of record/).first()).toBeVisible();
});
