import { expect, test } from "@playwright/test";

test("run a local Captain's Mode draft, undo, and share it read-only", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/draft");
  await expect(
    page.getByRole("heading", { level: 1, name: "Captain's Mode drafting" }),
  ).toBeVisible();

  const grid = page.getByRole("region", { name: "Heroes" });
  // Nothing is choosable before the draft starts.
  await expect(grid.getByRole("button", { name: "pick Pudge" })).toBeDisabled();

  await page.getByRole("button", { name: "Start draft" }).click();
  await expect(page.getByText("Step 1 of 24", { exact: true })).toBeVisible();

  // Current CM order opens with a ban by the first-pick team.
  await grid.getByRole("button", { name: "ban Pudge" }).click();
  await expect(grid.getByRole("button", { name: "Pudge, unavailable" })).toBeDisabled();
  await expect(page.getByText("Step 2 of 24", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Step 1 of 24", { exact: true })).toBeVisible();
  await expect(grid.getByRole("button", { name: "ban Pudge" })).toBeEnabled();

  await grid.getByRole("button", { name: "ban Anti-Mage" }).click();
  await page.getByRole("button", { name: "Share" }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/draft\?snapshot=[A-Za-z0-9_-]+$/);

  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Shared draft" })).toBeVisible();
  await expect(page.getByText(/Read-only view/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Heroes" })).toHaveCount(0);
});

test("tampered share links show a friendly error", async ({ page }) => {
  await page.goto("/draft?snapshot=not-a-real-draft");
  await expect(page.getByRole("heading", { name: "This draft link is broken" })).toBeVisible();
});
