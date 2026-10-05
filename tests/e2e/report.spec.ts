import { expect, test } from "@playwright/test";

test("the battle report sums up your games over a period", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Battle report" })
    .click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your battle report" })).toBeVisible();

  // Fixture: 12 games over the last 12 days, GPM 600–710.
  const overview = page.getByRole("region", { name: "Overview" });
  await expect(overview).toContainText("Games played12");
  await expect(page.getByRole("region", { name: "Radiant vs Dire" })).toContainText("Radiant");
  const best = page.getByRole("region", { name: "Your best games" });
  await expect(best.getByRole("link", { name: /^Max GPM: 710/ })).toHaveAttribute(
    "href",
    /^\/matches\/\d+$/,
  );
  await expect(page.getByRole("region", { name: "Most played heroes" })).toContainText("Anti-Mage");
  await expect(page.getByRole("region", { name: "Calendar" })).toContainText(
    "Played on 12 of 90 days",
  );

  await page
    .getByRole("navigation", { name: "Period" })
    .getByRole("link", { name: "Last 30 days" })
    .click();
  await expect(page).toHaveURL(/\/report\?days=30$/);
  await expect(page.getByRole("region", { name: "Calendar" })).toContainText("of 30 days");
});
