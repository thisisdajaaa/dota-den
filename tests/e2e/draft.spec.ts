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
  // While drafting, the details are folded away under the win-chance bar.
  await expect(outlook.getByRole("table", { name: "Stats for every picked hero" })).toHaveCount(0);
  await outlook.getByRole("button", { name: "Show details" }).click();
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

  // The rubric: each side graded per criterion, provisional until the lineups are complete.
  const card = outlook.getByRole("region", { name: "Draft report card" });
  await expect(card).toContainText("provisional");
  for (const criterion of [
    "Lanes",
    "Counters",
    "Composition",
    "Hero strength",
    "Positions",
    "Combos",
  ]) {
    await expect(card.getByRole("rowheader", { name: new RegExp(criterion) })).toBeVisible();
  }

  // Change who plays where: the analysis reloads with the new position.
  await outlook.getByText("Change who plays where").click();
  const select = outlook.getByRole("combobox", { name: /^Position for / }).first();
  await select.selectOption("3");
  await expect(select).toHaveValue("3");
  await expect(outlook.getByRole("button", { name: "Use the suggested positions" })).toBeVisible();

  await expect(
    page.getByRole("region", { name: "Radiant draft" }).getByText(/^Position \d, /),
  ).toHaveCount(1);
});

test("a finished draft gets a full report card and offers the AI review", async ({ page }) => {
  await page.goto("/draft");
  await page.getByRole("combobox", { name: "Opponent" }).click();
  await page.getByRole("option", { name: "Practice both sides" }).click();
  await page.getByRole("combobox", { name: "Ruleset" }).click();
  await page.getByRole("option", { name: "Simple practice" }).click();
  await page.getByRole("button", { name: "Start draft" }).click();

  // Simple practice: 8 bans and 10 picks. Take the top suggestion each time.
  const suggestions = page.getByRole("region", { name: "Suggestions" });
  const log = page.getByRole("region", { name: "Draft log" });
  for (let step = 1; step <= 18; step++) {
    await suggestions.getByRole("button").first().click();
    await expect(log.getByRole("listitem")).toHaveCount(step);
  }
  await expect(page.getByText("Both lineups are locked in")).toBeVisible();

  const outlook = page.getByRole("region", { name: "Draft outlook" });
  const card = outlook.getByRole("region", { name: "Draft report card" });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("provisional");

  // No language model is configured in tests: the review says so instead of failing silently.
  const review = outlook.getByRole("region", { name: "AI review" });
  await review.getByRole("button", { name: "Get the AI review" }).click();
  await expect(review.getByRole("alert")).toContainText("isn't set up");
});

test("suggestions retry when busy and say so when they can't load", async ({ page }) => {
  // Busy once (rate limited), then fine: the panel says it's retrying, then shows them.
  let calls = 0;
  await page.route("**/api/v1/drafts/suggestions", async (route) => {
    calls++;
    if (calls === 1) {
      await route.fulfill({ status: 429, json: { error: { code: "rate_limited", message: "" } } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/draft");
  await page.getByRole("button", { name: "Start draft" }).click();
  const panel = page.getByRole("region", { name: "Suggestions" });
  await expect(panel).toContainText("Busy right now, trying again…");
  await expect(panel.getByRole("button").first()).toBeVisible({ timeout: 15_000 });
  expect(calls).toBe(2);

  // A failure retrying won't fix: say so at once, and the draft still works.
  await page.unroute("**/api/v1/drafts/suggestions");
  await page.route("**/api/v1/drafts/suggestions", (route) =>
    route.fulfill({ status: 400, json: { error: { code: "bad_request", message: "" } } }),
  );
  await page
    .getByRole("region", { name: "Heroes" })
    .getByRole("button", { name: "ban Pudge" })
    .click();
  await expect(panel.getByRole("status")).toContainText("Suggestions are unavailable right now");
  await expect(
    page.getByRole("region", { name: "Heroes" }).getByRole("button", { name: "ban Anti-Mage" }),
  ).toBeEnabled();
});

test("the hero list comes before the outlook, and its search can be cleared", async ({ page }) => {
  await page.goto("/draft");
  await page.getByRole("button", { name: "Start draft" }).click();
  const grid = page.getByRole("region", { name: "Heroes" });
  const search = grid.getByRole("searchbox", { name: "Search heroes" });
  await search.fill("pudge");
  await expect(grid.getByRole("button", { name: "ban Anti-Mage" })).toHaveCount(0);
  await grid.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toHaveValue("");
  await expect(grid.getByRole("button", { name: "ban Anti-Mage" })).toBeVisible();

  // Pick a hero so the outlook shows, then check the order on the page.
  await grid.getByRole("button", { name: "ban Pudge" }).click();
  const top = async (name: string) => (await page.getByRole("region", { name }).boundingBox())!.y;
  expect(await top("Heroes")).toBeLessThan(await top("Draft outlook"));
});
