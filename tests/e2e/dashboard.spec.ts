import { expect, test } from "@playwright/test";

test("dashboard auto-syncs matches and links to an in-app match page", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Auto-sync imports the 12 fixture matches without any button press.
  await expect(page.getByText(/of 12 imported matches in view/)).toBeVisible({ timeout: 20_000 });

  // Solo/party/unknown totals reconcile: 6 solo + 4 party + 2 unknown = 12.
  const split = page.getByRole("region", { name: "Win rate by queue" });
  await expect(split).toContainText("n=6");
  await expect(split).toContainText("n=4");
  await expect(split).toContainText("n=2");
  await expect(split).toContainText("never as solo");

  // Match rows open our own match page, not an external site.
  const firstMatch = page.getByRole("region", { name: "Recent matches" }).getByRole("link").first();
  await expect(firstMatch).toHaveAttribute("href", /^\/matches\/\d+$/);
  await firstMatch.click();

  await expect(page).toHaveURL(/\/matches\/7000000012$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Victory");
  await expect(page.getByRole("region", { name: "The Radiant" })).toBeVisible();
  await expect(page.getByRole("region", { name: "The Dire" })).toBeVisible();
  await expect(page.locator("tr[aria-current=true]")).toContainText("Fixture Hero");
  await expect(page.getByRole("img", { name: /advantage by minute/ })).toBeVisible();
});

test("guests can view a public match page", async ({ page }) => {
  await page.goto("/matches/7000000012");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Victory");
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
});

test("unknown and malformed match ids show not found", async ({ page }) => {
  await page.goto("/matches/1");
  await expect(page.getByRole("heading", { name: "Match not found" })).toBeVisible();
  await page.goto("/matches/abc");
  await expect(page.getByRole("heading", { name: "Match not found" })).toBeVisible();
});
