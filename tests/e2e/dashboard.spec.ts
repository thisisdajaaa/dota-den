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

  // How did I play: your line against everyone on the same hero.
  const perf = page.getByRole("region", { name: "How you played" });
  await expect(perf).toContainText("Strongest: last hits per minute, better than 97%");
  await expect(perf).toContainText("Room to improve: tower damage, better than 12%");
  await expect(perf).toContainText("70% at this rank");
  // Pick another player from the match.
  const others = perf.getByRole("navigation", { name: "Choose a player" }).getByRole("link");
  await others
    .filter({ hasNot: page.locator("[aria-current]") })
    .first()
    .click();
  await expect(page.getByRole("region", { name: /^How .* played$/ })).toContainText(
    "Gold per minute",
  );
  await expect(page.getByRole("region", { name: "How you played" })).toHaveCount(0);
});

test("guests can view a public match page", async ({ page }) => {
  await page.goto("/matches/7000000012");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Victory");
  await expect(page.getByRole("region", { name: "How did they play?" })).toContainText(
    "Pick a player",
  );
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

test("sync waits out a busy OpenDota and tries again by itself", async ({ page }) => {
  let calls = 0;
  let busyNext = false;
  await page.route("**/api/v1/me/matches/sync", async (route) => {
    calls++;
    if (busyNext) {
      busyNext = false;
      await route.fulfill({
        status: 429,
        json: {
          error: {
            code: "rate_limited",
            message: "OpenDota is busy right now.",
            details: { reason: "upstream_rate_limited", retryAt: new Date().toISOString() },
          },
        },
      });
    } else {
      await route.continue();
    }
  });
  // Another test may have synced this account already, so don't rely on the sync on load:
  // press "Sync now" once it's free.
  await page.goto("/api/v1/auth/steam/login?as=76561197960305729");
  await expect(page).toHaveURL(/\/dashboard$/);
  const syncNow = page.getByRole("button", { name: "Sync now" });
  await expect(syncNow).toBeEnabled({ timeout: 20_000 });
  const before = calls;
  busyNext = true;
  await syncNow.click();
  await expect(page.getByRole("status").filter({ hasText: "OpenDota is busy" })).toBeVisible();
  await expect.poll(() => calls, { timeout: 20_000 }).toBeGreaterThanOrEqual(before + 2);
  await expect(page.getByText("Sync paused")).toHaveCount(0);
});

test("the MMR prompt's close button never covers its form", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  type Box = { x: number; y: number; width: number; height: number };
  const overlap = (a: Box, b: Box) =>
    !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    );
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard");
    const prompt = page.getByRole("region", { name: "Log your MMR" });
    await expect(prompt).toBeVisible();
    const close = (await prompt.getByRole("button", { name: "Not now" }).boundingBox())!;
    for (const other of [
      prompt.getByRole("button", { name: "Log it" }),
      prompt.getByRole("textbox", { name: "Your MMR now" }),
    ]) {
      expect(overlap(close, (await other.boundingBox())!), `at ${width}px`).toBe(false);
    }
  }
});

test("the overview shows this week against last week", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  // The fixture has a game a day for 12 days, so this week or last week has ranked games.
  await page.reload();
  const week = page.getByRole("region", { name: "This week" });
  await expect(week).toContainText(/Win rate|No ranked games yet this week/);
  await expect(week.getByRole("link", { name: /Week in the MMR journal/ })).toHaveAttribute(
    "href",
    "/mmr?view=week",
  );
});

test("parsed matches show laning and item timings; others can request a parse", async ({
  page,
}) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/matches/7000000012");
  const laning = page.getByRole("region", { name: "Laning & items" });
  const table = laning.getByRole("table", { name: /at 10 minutes/ });
  await expect(table.getByRole("row", { name: /\(you\)/ })).toContainText("50");
  await expect(table.getByRole("row", { name: /\(you\)/ })).toContainText("3,800");
  await expect(laning).toContainText("lane efficiency 74%");
  await expect(laning).toContainText("Power Treads");
  await expect(laning).toContainText("10:00");
  await expect(laning).not.toContainText("Tango");
  await expect(laning).toContainText("2 obs");

  await page.goto("/matches/7000000011");
  const unparsed = page.getByRole("region", { name: "Laning & items" });
  await unparsed.getByRole("button", { name: "Get detailed stats" }).click();
  await expect(unparsed.getByRole("status")).toContainText("Requested");
});

test("the overview shows achievements from your own games", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  const ach = page.getByRole("region", { name: "Achievements" });
  await expect(ach.getByRole("listitem", { name: /^Veteran/ })).toContainText("12 / 100");
  await expect(ach).toContainText(/\d+ of \d+ tiers/);
});

test("your real ranked drafts are graded: per match and over recent games", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/matches");
  const card = page.getByRole("region", { name: "Did the draft decide it?" });
  await expect(card).toContainText("Your last 12 ranked games");
  await expect(card).toContainText("Draft favoured you");
  await expect(card).toContainText("a tendency, not a verdict");

  await page.goto("/matches/7000000012");
  const draft = page.getByRole("region", { name: "The draft" });
  await expect(
    draft.getByRole("img", { name: /Estimated win chance from the draft/ }),
  ).toBeVisible();
  await expect(draft).toContainText(/(Radiant|Dire) won/);
});
