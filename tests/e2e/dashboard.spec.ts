import { expect, test } from "@playwright/test";

test("dashboard auto-syncs matches and links to an in-app match page", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);

  // Immortal players show their leaderboard position, not just the medal.
  const banner = page.getByRole("region", { name: "Player" });
  await expect(banner.getByText("Immortal #1,234", { exact: true })).toBeVisible();
  await expect(banner.getByRole("img", { name: "Immortal #1,234" }).first()).toBeAttached();

  // Auto-sync imports the 12 fixture matches without any button press.
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });

  // Solo/party/unknown totals reconcile: 6 solo + 4 party + 2 unknown = 12.
  const stats = page.getByRole("region", { name: "Key stats" });
  await expect(stats).toContainText("6 solo games");
  await expect(stats).toContainText("4 party games");
  const split = page.getByRole("region", { name: "Win rate by queue" });
  await expect(split).toContainText("Queue known for 10 of 12 games");
  await expect(split).toContainText("never assumed to be solo");

  // Hero pool sorting. Fixture: Anti-Mage 8 games, Pudge 4 (both under 10).
  const pool = page.getByRole("region", { name: "Your heroes" });
  await expect(pool.locator("li").first()).toContainText("Anti-Mage");
  await pool.getByRole("radio", { name: "Recent" }).click();
  await expect(pool.getByRole("radio", { name: "Recent" })).toHaveAttribute("aria-checked", "true");
  await pool.getByRole("radio", { name: "Win rate" }).click();
  await expect(pool).toContainText("No hero has 10+ games");
  await pool.getByRole("radio", { name: "Most played" }).click();

  // Match rows open our own match page, not an external site.
  const recent = page.getByRole("region", { name: "Recent matches" });
  await expect(recent.getByRole("link", { name: "View all matches" })).toHaveAttribute(
    "href",
    "/matches",
  );
  const firstMatch = recent.locator('a[href^="/matches/"]').first();
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

test("match list filters and totals reconcile", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/matches");
  const totals = page.getByRole("region", { name: "Filtered totals" });
  await expect(totals).toContainText("12");

  await page
    .getByRole("navigation", { name: "Queue" })
    .getByRole("link", { name: "Unknown" })
    .click();
  await expect(page).toHaveURL(/queue=unknown/);
  await expect(totals).toContainText("2");
  await expect(totals).toContainText("too few to judge");
  await expect(
    page.getByRole("region", { name: "Matches" }).locator('a[href^="/matches/"]'),
  ).toHaveCount(2);

  // Regression: filtering to wins must not turn the record into "N-0, 100%".
  await page.goto("/matches?result=win");
  await expect(totals).toContainText("Showing wins");
  await expect(totals).toContainText("count both wins and losses");
  await expect(totals).not.toContainText("100.0%");
  // Fixture history is 7 wins and 5 losses: 7 listed, record keeps the losses.
  await expect(totals).toContainText("7 – 5");
  await expect(totals).toContainText("58.3%");
  await expect(
    page.getByRole("region", { name: "Matches" }).locator('a[href^="/matches/"]'),
  ).toHaveCount(7);

  // Garbage params fall back to defaults instead of erroring.
  await page.goto("/matches?queue=%24ne&result=drop&hero=abc&cursor=../../x");
  await expect(totals).toContainText("12");
});
