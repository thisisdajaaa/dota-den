import { expect, test } from "@playwright/test";

test("how you compare: your heroes against players at your rank", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/heroes");
  await page.getByRole("link", { name: "How you compare" }).click();
  await expect(page).toHaveURL(/\/heroes\/compare$/);
  await expect(page.getByRole("heading", { level: 1, name: "How you compare" })).toBeVisible();

  // The fixture player is Immortal: compared with Divine–Immortal, at the same game length.
  const heroes = page.getByRole("region", { name: "Against Divine–Immortal players" });
  await expect(heroes.getByRole("link", { name: /Anti-Mage/ })).toBeVisible();
  await expect(heroes).toContainText("Deaths");
  await expect(heroes).toContainText(/[+-]\d+%/);
  await expect(
    page.getByRole("region", { name: "Your biggest gap and your biggest edge" }),
  ).toBeVisible();
  await expect(page.getByText(/against the averages of the latest full week/)).toBeVisible();

  // "The rank above" is the same bracket at the top.
  await page.getByRole("link", { name: "The rank above" }).click();
  await expect(page).toHaveURL(/\/heroes\/compare\?vs=next$/);
  await expect(page.getByRole("region", { name: "Against Divine–Immortal players" })).toBeVisible();
});
