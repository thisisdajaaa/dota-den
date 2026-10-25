import { expect, test } from "@playwright/test";

test("pick for me ranks your own heroes against the enemy picks", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  // Auto-sync imports the fixture matches: those heroes are your pool.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.goto("/draft");
  await page.getByRole("link", { name: "Pick for me (ranked)" }).click();
  await expect(page).toHaveURL(/\/draft\/pick$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pick for me" })).toBeVisible();

  const results = page.getByRole("region", { name: "Your best picks" });
  // Before any enemy pick: your heroes on your own record.
  await expect(results.getByRole("listitem").first()).toContainText(/You: \d+% in \d+ games/);

  // Add an enemy pick from the hero grid: it lands in "Enemy picks" and counters appear.
  await page.getByRole("searchbox", { name: "Search heroes" }).fill("pudge");
  await page.getByRole("button", { name: /Pudge/ }).first().click();
  await expect(page.getByRole("list", { name: "Enemy picks" })).toContainText("Pudge");
  await expect(results).toContainText(/vs Pudge [+-]\d/);

  // The score is shown with its parts, never as a win chance.
  await expect(results).not.toContainText(/chance to win|win probability/i);

  // Removing the pick takes it out again.
  await page.getByRole("button", { name: "Remove Pudge" }).click();
  await expect(page.getByRole("list", { name: "Enemy picks" })).toHaveCount(0);
});

test("pick for me needs you signed in", async ({ page, request }) => {
  await page.goto("/draft/pick");
  await expect(page.getByRole("heading", { name: "Pick for me" })).toHaveCount(0);
  const res = await request.post("/api/v1/drafts/pick-for-me", {
    data: { enemies: [1], allies: [] },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(401);
});
