import { expect, test } from "@playwright/test";

test("wards and runes: habits and a map from your parsed games", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/heroes");
  await page.getByRole("link", { name: "Wards & runes" }).click();
  await expect(page).toHaveURL(/\/heroes\/wards$/);
  await expect(page.getByRole("heading", { level: 1, name: "Wards & runes" })).toBeVisible();

  // Match details are read in the background after the sync: reload until they're in.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/your latest parsed games with ward data/)).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });

  // Each fixture game: two observers (one taken down at 5:30 after 6 minutes up) and a sentry.
  const tiles = page.getByRole("region", { name: "Your ward habits" });
  await expect(tiles).toContainText("Observers per game");
  await expect(tiles).toContainText("2.0");
  await expect(tiles).toContainText("Sentries per game");
  await expect(tiles).toContainText("First observer");
  await expect(tiles).toContainText("-0:30");

  const map = page.getByRole("region", { name: "Your ward map" });
  const img = map.getByRole("img", { name: /wards on the map/ });
  const all = Number((await img.getAttribute("aria-label"))!.match(/\d+/)![0]);
  expect(all).toBeGreaterThan(0);
  await map.getByRole("radio", { name: "Sentries" }).click();
  await expect(img).toHaveAttribute("aria-label", `${all / 3} wards on the map`);
  await map.getByRole("radio", { name: "Late game (30+)" }).click();
  await expect(img).toHaveAttribute("aria-label", "0 wards on the map");
  await expect(map.getByRole("status")).toHaveText("No wards in this filter.");

  // The parsed fixture game: a horn bounty, a haste rune at 6:00 and a wisdom rune.
  const runes = page.getByRole("region", { name: "Your runes" });
  await expect(runes).toContainText("Bounty runes per game");
  await expect(runes).toContainText("Horn bounty");
  // One parsed fixture game: too few for the horn share, which waits rather than guessing.
  await expect(runes).toContainText("Needs 5 games with rune data (1 so far)");
  await expect(runes).toContainText("1.0 per game before 10:00");
  await expect(runes.getByRole("listitem").filter({ hasText: "Haste" })).toBeVisible();
});
