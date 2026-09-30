import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  // Auto-sync imports the 12 fixture matches.
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
}

test("the overview shows where you play, with the sample it's based on", async ({ page }) => {
  await signIn(page);

  // Fixture: 8 safe-lane Anti-Mage games (6 won), 4 off-lane Pudge games (1 won).
  const lanes = page.getByRole("region", { name: "Where you play" });
  const positions = lanes.getByRole("list", { name: "Positions" });
  await expect(positions.getByRole("listitem").nth(0)).toContainText("Pos 1");
  await expect(positions.getByRole("listitem").nth(0)).toContainText("75.0% · 8 games");
  await expect(positions.getByRole("listitem").nth(2)).toContainText("25.0% · 4 games");
  await expect(positions.getByRole("listitem").nth(1)).toContainText("No games");
  await expect(lanes).toContainText("too few to judge");
  await expect(lanes).toContainText("Your last 12 games from the past 60 days");
  await expect(lanes).toContainText("0 games with no lane data");
});

test("a hero page shows your record, trend, matchups, items and recent games", async ({ page }) => {
  await signIn(page);

  // The overview's hero pool links to each hero page.
  const pool = page.getByRole("region", { name: "Your heroes" });
  await pool
    .getByRole("link", { name: /Anti-Mage/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/heroes\/1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anti-Mage");

  const record = page.getByRole("region", { name: "Your record" });
  await expect(record).toContainText("75.0%");
  await expect(record).toContainText("6 wins · 2 losses · too few to judge");
  await expect(record).toContainText("Last played");
  // GPM / XPM averaged over the 8 fixture games on Anti-Mage.
  await expect(record).toContainText("660 / 760");
  await expect(record).toContainText("Average over your last 8 games on this hero");

  // Every fixture game is in one patch, so the trend is split by month (and says so).
  const trend = page.getByRole("region", { name: "Win rate trend" });
  await expect(trend).toContainText("split by month");
  await expect(trend.getByRole("list", { name: "By month" })).toBeVisible();

  const highRank = page.getByRole("region", { name: "High-rank win rate" });
  await expect(highRank).toContainText("48.0%");
  await expect(highRank).toContainText("public high-rank games on Anti-Mage");
  await expect(highRank).toContainText("too few to compare");

  const matchups = page.getByRole("region", { name: "Who you beat and lose to on Anti-Mage" });
  await expect(matchups.getByRole("list", { name: "You beat" })).toContainText("Fixture Hero 101");
  await expect(matchups.getByRole("list", { name: "You beat" })).toContainText("83.3% · 6 games");
  await expect(matchups.getByRole("list", { name: "You lose to" })).toContainText(
    "Fixture Hero 102",
  );
  await expect(matchups.getByRole("list", { name: "You win with" })).toContainText(
    "Fixture Hero 104",
  );
  // Met in only 2 games: left out.
  await expect(matchups).not.toContainText("Fixture Hero 103");
  await expect(matchups).toContainText("From your 8 games on Anti-Mage");

  const items = page.getByRole("region", { name: "Your most-bought items" });
  await expect(items).toContainText("Battle Fury");
  await expect(items).toContainText("Manta Style");
  await expect(items).toContainText("4 of 6");
  await expect(items).toContainText("From 6 games with purchase data");
  await expect(items).not.toContainText("Tango");
  await expect(items).not.toContainText("Boots of Speed");

  const recent = page.getByRole("region", { name: "Recent matches on Anti-Mage" });
  await expect(recent.locator('a[href^="/matches/"]')).toHaveCount(8);
  await expect(recent.getByRole("link", { name: "View all 8 matches" })).toHaveAttribute(
    "href",
    "/matches?hero=1",
  );
  // Match rows open our own match page, never an external site.
  await expect(recent.locator('a[href^="http"]')).toHaveCount(0);
});

test("the heroes index lists your heroes and positions", async ({ page }) => {
  await signIn(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Heroes" })
    .click();
  await expect(page).toHaveURL(/\/heroes$/);

  const grid = page.getByRole("list", { name: "Heroes you've played" });
  await expect(grid.getByRole("link")).toHaveCount(2);
  await expect(grid.getByRole("link").first()).toHaveAttribute("href", "/heroes/1");
  await expect(grid.getByRole("link").nth(1)).toContainText("Pudge");

  // Suggestions for your role, favouring heroes that beat the one you lose to most.
  const advice = page.getByRole("region", { name: "Heroes to add" });
  await expect(advice).toContainText("Pos 1");
  await expect(advice).toContainText("Fixture Hero 110");
  await expect(advice.getByRole("link")).toHaveCount(3);
  await expect(advice.getByRole("link").first()).toHaveAttribute("href", /^\/guides\/\d+$/);

  const lanes = page.getByRole("region", { name: "Where you play" });
  await expect(lanes.getByRole("list", { name: "Heroes as Pos 3" })).toContainText("Pudge");
  await lanes.getByRole("list", { name: "Heroes as Pos 3" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/heroes\/14$/);
  await expect(page.getByRole("region", { name: "Your record" })).toContainText("25.0%");
});

test("hero pages need you signed in and a real hero", async ({ page }) => {
  await page.goto("/heroes/1");
  await expect(page).not.toHaveURL(/\/heroes\/1$/);

  await signIn(page);
  await page.goto("/heroes/abc");
  await expect(page.getByRole("heading", { name: "Hero not found" })).toBeVisible();
  await page.goto("/heroes/999");
  await expect(page.getByRole("heading", { name: "Hero not found" })).toBeVisible();

  // A real hero you haven't played: says so, and still shows the public rate.
  await page.goto("/heroes/100");
  await expect(
    page.getByRole("heading", { name: "No games on Fixture Hero 100 yet" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "High-rank win rate" })).toBeVisible();
});
