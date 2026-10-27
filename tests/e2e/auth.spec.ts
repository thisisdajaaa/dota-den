import { expect, test } from "@playwright/test";

test("guest sees the landing page and disclaimer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("independent software");
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
});

test("guest is redirected away from the dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/auth_error=signed_out/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign in required");
  // One sign-in button in the page: the banner's (the hero's is hidden meanwhile).
  await expect(
    page.getByRole("main").getByRole("link", { name: "Sign in through Steam" }),
  ).toHaveCount(1);
});

test("signing in from the redirect banner returns to the page you asked for", async ({ page }) => {
  await page.goto("/matches?queue=party");
  await expect(page).toHaveURL(/\/\?auth_error=signed_out&next=%2Fmatches%3Fqueue%3Dparty$/);
  const banner = page.getByRole("main").getByRole("alert");
  await expect(banner).toContainText("Sign in required");
  await banner.getByRole("link", { name: "Sign in through Steam" }).click();

  await expect(page).toHaveURL(/\/matches\?queue=party$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("sign-in ignores a next path that leaves the site", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login?next=%2F%2Fevil.example%2Fdashboard");
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/dashboard$/);
});

test("sign in with the test identity provider, survive reload, then sign out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Sign in through Steam" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fixture Hero");

  await page.reload();
  await expect(page.getByText("Account 22202")).toBeVisible();

  const me = await page.request.get("/api/v1/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({
    success: true,
    data: { steamId64: "76561197960287930", accountId32: 22202 },
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/\?bye=1$/);
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
  // Steam keeps its own sign-in, so say how to switch accounts.
  await expect(page.getByRole("alert").filter({ hasText: "signed out of Dota Den" })).toContainText(
    "sign out of Steam first",
  );
  await expect(page.getByRole("link", { name: "open Steam Community" })).toHaveAttribute(
    "href",
    "https://steamcommunity.com/",
  );
});

test("callback without a matching state cookie is rejected", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/callback?state=forged&test_steam_id=76561197960287930");
  await expect(page).toHaveURL(/auth_error=state_mismatch/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign-in failed");
  expect((await page.request.get("/api/v1/me")).status()).toBe(401);
});

test("sign-out rejects cross-origin requests", async ({ request }) => {
  const res = await request.post("/api/v1/auth/sign-out", {
    headers: { origin: "https://evil.example" },
  });
  expect(res.status()).toBe(403);
});
