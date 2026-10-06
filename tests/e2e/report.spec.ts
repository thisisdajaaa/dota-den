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

  // Compared with the 30 days before (the fixture has no older games).
  await expect(page.getByRole("region", { name: "Compared with the period before" })).toContainText(
    "nothing to compare",
  );

  // Replay-only sections show their sample and stay hidden below the minimum.
  await expect(page.getByRole("region", { name: "Lane results" })).toContainText(/of 5 needed/);
  await expect(page.getByRole("region", { name: "Map objectives" })).toContainText(/of 5 needed/);

  // The Heroes tab keeps the period in the URL.
  await page
    .getByRole("navigation", { name: "Report sections" })
    .getByRole("link", { name: "Heroes" })
    .click();
  await expect(page).toHaveURL(/\/report\?days=30&tab=heroes$/);
  const table = page.getByRole("region", { name: "Every hero this period" });
  await expect(table.getByRole("columnheader", { name: "GPM" })).toBeVisible();
  await expect(table).toContainText("Anti-Mage");
});

test("a custom range is a shareable URL", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/report");
  const form = page.getByRole("form", { name: "Custom range" });
  const day = (offset: number) =>
    new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  await form.getByLabel("From").fill(day(5));
  await form.getByLabel("To").fill(day(1));
  await form.getByRole("button", { name: "Show range" }).click();
  await expect(page).toHaveURL(new RegExp(`/report\\?from=${day(5)}&to=${day(1)}$`));
  await expect(
    page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "Custom" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Calendar" })).toContainText("of 5 days");
  // Reloading the URL shows the same range.
  await page.reload();
  await expect(page.getByRole("region", { name: "Calendar" })).toContainText("of 5 days");
});
