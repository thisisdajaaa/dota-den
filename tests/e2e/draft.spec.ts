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

test("play against the AI captain with suggestions and a two-sided draft log", async ({ page }) => {
  await page.goto("/draft");
  await expect(page.getByRole("combobox", { name: "Opponent" })).toContainText("vs AI captain");
  await page.getByRole("button", { name: "Start draft" }).click();

  // Your turn: data-backed suggestions appear; take one.
  const suggestions = page.getByRole("region", { name: "Suggestions" });
  await expect(suggestions).toContainText("Suggested bans for you");
  await suggestions.getByRole("button").first().click();

  // Second ban from the grid. Then the AI (Dire) bans twice.
  const grid = page.getByRole("region", { name: "Heroes" });
  await grid.getByRole("button", { name: "ban Pudge", exact: true }).click();

  const log = page.getByRole("region", { name: "Draft log" });
  await expect(log.getByRole("listitem")).toHaveCount(4, { timeout: 20_000 });
  await expect(log).toContainText("suggested");
  await expect(log).toContainText("rule-based"); // no model key in tests
  await expect(log.getByText("You", { exact: true })).toHaveCount(2);
  await expect(log.getByText("AI", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Step 5 of 24", { exact: true })).toBeVisible();

  // Undo rewinds the AI's replies too, back to your own turn.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Step 2 of 24", { exact: true })).toBeVisible();
  await expect(log.getByRole("listitem")).toHaveCount(1);
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

test("the draft outlook estimates who the draft favours, with its evidence", async ({ page }) => {
  await page.goto("/draft");
  await page.getByRole("combobox", { name: "Opponent" }).click();
  await page.getByRole("option", { name: "Practice both sides" }).click();
  await page.getByRole("button", { name: "Start draft" }).click();

  const outlook = page.getByRole("region", { name: "Draft outlook" });
  await expect(outlook).toContainText("Once heroes are picked");

  // Take the top suggestion until both sides have picked.
  const suggestions = page.getByRole("region", { name: "Suggestions" });
  const log = page.getByRole("region", { name: "Draft log" });
  for (let step = 1; step <= 10; step++) {
    await suggestions.getByRole("button").first().click();
    await expect(log.getByRole("listitem")).toHaveCount(step);
  }

  await expect(outlook.getByRole("img", { name: /Estimated win chance/ })).toBeVisible();
  await expect(outlook).toContainText("Estimate");
  await expect(outlook).toContainText(/Radiant \d+%/);
  await expect(outlook).toContainText("Hero strength");
  await expect(outlook.getByRole("table", { name: "Stats for every picked hero" })).toBeVisible();
  // Tournament numbers come from the (fixture) pro drafts.
  await expect(outlook).toContainText("% of drafts");
  await expect(outlook).toContainText("between 30% and 70%");

  // Five positions: each pick gets one, and the outlook lays out both lineups by position.
  await expect(outlook).toContainText("Lineups by position");
  await expect(outlook).toContainText("1 · Carry");
  await expect(outlook).toContainText("5 · Hard support");
  await expect(outlook).toContainText("Positions from where the pros play each hero");
  await expect(
    page.getByRole("region", { name: "Radiant draft" }).getByText(/^Position \d, /),
  ).toHaveCount(1);
});
