import { expect, test } from "@playwright/test";

test("solve a last-pick challenge and see a grade with alternatives", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/draft");
  await page.getByRole("link", { name: "Draft challenges" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft challenges" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your progress" })).toContainText(
    "No puzzles answered yet",
  );

  await page.getByRole("link", { name: "Start Last pick" }).click();
  await expect(page).toHaveURL(/\/draft\/challenges\/last_pick\?seed=[a-z0-9]+$/);
  const puzzleUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: "Last pick" })).toBeVisible();
  // 4 v 5: one open slot on your side, none on theirs.
  await expect(
    page.getByRole("region", { name: "Your team" }).getByRole("listitem", { name: "Open slot" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Enemy team" }).getByRole("listitem", { name: "Open slot" }),
  ).toHaveCount(0);

  const lockIn = page.getByRole("button", { name: "Lock in pick" });
  await expect(lockIn).toBeDisabled();
  const grid = page.getByRole("region", { name: "Heroes", exact: true });
  const first = grid.getByRole("button", { name: /^pick / }).first();
  const heroName = (await first.getAttribute("aria-label"))!.replace(/^pick /, "");
  await first.click();
  await expect(page.getByRole("button", { name: `Remove ${heroName}` })).toBeVisible();
  await lockIn.click();

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText(/Your grade\s*(Excellent|Good|Playable|Risky)/);
  await expect(result).toContainText(heroName);
  await expect(result).toContainText("drafting also depends on lanes and players");
  await expect(result).not.toContainText(/probabilit/i);
  const best = page.getByRole("region", { name: "Best alternatives" });
  const alternatives = best.locator(":scope > ol > li");
  await expect(alternatives).toHaveCount(3);
  for (const alt of await alternatives.all()) {
    await expect(alt).toContainText("win rate at high ranks");
  }
  // The picker is replaced by the result.
  await expect(grid).toHaveCount(0);

  await page.getByRole("button", { name: "Share this puzzle" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(puzzleUrl);

  await page.getByRole("button", { name: "Next puzzle" }).click();
  await expect(page).not.toHaveURL(puzzleUrl);
  await expect(page).toHaveURL(/\/draft\/challenges\/last_pick\?seed=[a-z0-9]+$/);
  await expect(page.getByRole("region", { name: "Heroes", exact: true })).toBeVisible();

  // The answer is remembered on this device.
  await page.goto("/draft/challenges");
  await expect(
    page.getByRole("region", { name: "Your progress" }).getByRole("listitem"),
  ).toHaveCount(1);
});

test("opening bans need two heroes", async ({ page }) => {
  await page.goto("/draft/challenges/first_phase_bans?seed=e2eopen");
  await expect(
    page.getByRole("region", { name: "Banned heroes" }).getByRole("listitem"),
  ).toHaveCount(2);
  const grid = page.getByRole("region", { name: "Heroes", exact: true });
  await grid.getByRole("button", { name: /^ban / }).nth(0).click();
  await expect(page.getByRole("button", { name: "Lock in 1/2 bans" })).toBeDisabled();
  await grid.getByRole("button", { name: /^ban / }).nth(1).click();
  await page.getByRole("button", { name: "Lock in 2/2 bans" }).click();
  await expect(page.getByRole("region", { name: "Result" })).toContainText(
    /Excellent|Good|Playable|Risky/,
  );
});

test("tampered challenge links show friendly errors", async ({ page }) => {
  await page.goto("/draft/challenges/last_pick?seed=NOT..valid");
  await expect(page.getByRole("heading", { name: "This puzzle link is broken" })).toBeVisible();
  await page.goto("/draft/challenges/mid_only?seed=abcd1234");
  await expect(page.getByRole("heading", { name: "This challenge doesn't exist" })).toBeVisible();
  await page.getByRole("link", { name: "Choose a challenge" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft challenges" })).toBeVisible();
});

test("the grade endpoint referees answers and rejects cross-origin calls", async ({ request }) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const post = (data: unknown, o = origin) =>
    request.post("/api/v1/drafts/challenges/grade", { data, headers: { origin: o } });

  const unavailable = await post({ type: "last_pick", seed: "e2eapi", heroIds: [9999] });
  expect(unavailable.status()).toBe(400);
  expect((await unavailable.json()).error.details.reason).toBe("unavailable");

  const wrongCount = await post({ type: "first_phase_bans", seed: "e2eapi", heroIds: [1] });
  expect(wrongCount.status()).toBe(400);
  expect((await wrongCount.json()).error.details.reason).toBe("wrong_count");

  expect((await post({ type: "mid_only", seed: "e2eapi", heroIds: [1] })).status()).toBe(400);
  expect((await post({ type: "last_pick", seed: "../x", heroIds: [1] })).status()).toBe(400);
  const cross = await post(
    { type: "last_pick", seed: "e2eapi", heroIds: [1] },
    "https://evil.example",
  );
  expect(cross.status()).toBe(403);
});
