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

test("play against the AI captain (rule-based fallback without a model key)", async ({ page }) => {
  await page.goto("/draft");
  await expect(page.getByRole("combobox", { name: "Opponent" })).toContainText("vs AI captain");
  await page.getByRole("button", { name: "Start draft" }).click();

  const grid = page.getByRole("region", { name: "Heroes" });
  // Current CM: the first-pick team (you, Radiant) bans twice, then the AI (Dire) bans twice.
  await grid.getByRole("button", { name: "ban Pudge", exact: true }).click();
  await grid.getByRole("button", { name: "ban Anti-Mage", exact: true }).click();

  const ai = page.getByRole("region", { name: "AI captain" });
  await expect(ai.getByRole("listitem")).toHaveCount(2, { timeout: 20_000 });
  await expect(ai).toContainText("rule-based");
  await expect(page.getByText("Step 5 of 24", { exact: true })).toBeVisible();

  // Undo rewinds the AI's replies too, back to your own turn.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Step 2 of 24", { exact: true })).toBeVisible();
  await expect(ai.getByRole("listitem")).toHaveCount(0);
});

test("the AI move endpoint validates input and rejects cross-origin calls", async ({ request }) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const bad = await request.post("/api/v1/drafts/ai-move", {
    data: { snapshot: "garbage!", aiSide: "dire" },
    headers: { origin },
  });
  expect(bad.status()).toBe(400);
  const cross = await request.post("/api/v1/drafts/ai-move", {
    data: { snapshot: "e30", aiSide: "dire" },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
});
