import { expect, test } from "@playwright/test";

test("guests can browse patch notes with official attribution", async ({ page }) => {
  await page.goto("/patches");
  await expect(page.getByRole("heading", { level: 1, name: "Patch notes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "7.41" })).toBeVisible();

  await page.getByRole("link", { name: /Read patch 7.41/ }).click();
  await expect(page).toHaveURL(/\/patches\/7\.41$/);
  await expect(page.getByRole("heading", { level: 1, name: "7.41" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Official notes on dota2.com/ })).toHaveAttribute(
    "href",
    "https://www.dota2.com/patches/7.41",
  );
  // Original wording is preserved and ability names resolve.
  await expect(page.getByText("Base Armor increased by 1").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meat Hook" }).first()).toBeVisible();
  await expect(page.getByText("Fixture general change")).toBeVisible();
  // Guests don't get watchlist controls.
  await expect(page.getByRole("button", { name: /Watch Pudge/ })).toHaveCount(0);
});

test("signed-in users see their changed heroes and can star one", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/patches/7.41");
  // Fixture history has 3+ ranked games on Anti-Mage and Pudge in the last 90 days.
  const yours = page.getByRole("region", { name: "Changes to your heroes" });
  await expect(yours.getByRole("heading", { name: "Pudge" })).toBeVisible();

  const heroesSection = page.getByRole("region", { name: "Heroes", exact: true });
  const star = heroesSection.getByRole("button", { name: "Watch Pudge" });
  const starred = heroesSection.getByRole("button", { name: "Stop watching Pudge" });
  // Retry until hydrated: a click before hydration does nothing.
  await expect(async () => {
    if ((await starred.count()) === 0) await star.click({ timeout: 2_000 });
    await expect(starred).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // The watchlist persisted server-side.
  const saved = await page.request.get("/api/v1/me/patch-watchlist");
  expect((await saved.json()).heroIds).toContain(14);

  // The overview sums up how the latest patch touched your heroes.
  await page.goto("/dashboard");
  const digest = page.getByRole("region", { name: /^7\.41 changed \d+ heroes? you play$/ });
  await expect(digest).toBeVisible({ timeout: 20_000 });
  await expect(digest.getByRole("link", { name: "What changed for Pudge in 7.41" })).toBeVisible();
  await expect(digest).toContainText("Base Armor increased by 1");
});

test("unknown and malformed versions show not found", async ({ page }) => {
  for (const v of ["9.99", "not-a-version", "..%2F..%2Fetc"]) {
    await page.goto(`/patches/${v}`);
    await expect(page.getByRole("heading", { name: "Patch not found" })).toBeVisible();
  }
});
