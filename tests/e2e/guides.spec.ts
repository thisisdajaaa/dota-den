import { expect, test } from "@playwright/test";

test("hero guides show pro builds, benchmarks and pro games", async ({ page }) => {
  await page.goto("/meta");
  await page.getByRole("link", { name: "Hero guides" }).click();
  await expect(page).toHaveURL(/\/guides$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hero guides" })).toBeVisible();
  // Search filters as you type, ignoring case and punctuation.
  await page.getByRole("searchbox", { name: "Find a hero" }).fill("anti mage");
  await expect(page.getByRole("link", { name: "Pudge" })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Find a hero" }).fill("zzz");
  await expect(page.getByRole("status")).toContainText("No hero matches");
  await page.getByRole("searchbox", { name: "Find a hero" }).fill("anti");
  await page
    .getByRole("region", { name: "Agility" })
    .getByRole("link", { name: "Anti-Mage" })
    .click();

  await expect(page).toHaveURL(/\/guides\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Anti-Mage" })).toBeVisible();

  const items = page.getByRole("region", { name: "What pros buy" });
  await expect(items.getByRole("group", { name: "Starting items" })).toContainText("Tango");
  // Consumables are left out after the start.
  await expect(items.getByRole("group", { name: "Early game" })).not.toContainText("Tango");
  await expect(items.getByRole("group", { name: "Mid game" })).toContainText("Battle Fury");
  await expect(items.getByRole("group", { name: "Late game" })).toContainText("Black King Bar");

  const bench = page.getByRole("region", { name: "What strong games look like" });
  await expect(bench.getByRole("row", { name: /Gold per minute/ })).toContainText("880");
  await expect(bench.getByRole("row", { name: /Last hits per minute/ })).toContainText("8.4");

  // Matchups from pro games, each opponent linking to its own guide.
  const matchups = page.getByRole("region", { name: "Matchups" });
  await expect(matchups.getByRole("group", { name: "Anti-Mage is strong against" })).toBeVisible();
  await expect(matchups.getByRole("group", { name: "Anti-Mage struggles against" })).toBeVisible();
  await expect(matchups.getByRole("link").first()).toHaveAttribute("href", /^\/guides\/\d+$/);

  const pro = page.getByRole("region", { name: "Recent pro games on Anti-Mage" });
  await expect(pro).toContainText("1–1 in the last 2");
  await expect(pro.getByRole("link", { name: /Fixture Pro/ })).toHaveAttribute(
    "href",
    "/matches/7100000001",
  );
  await expect(pro).toContainText("Unnamed player");
});

test("unknown and malformed heroes show not found", async ({ page }) => {
  for (const id of ["999", "abc"]) {
    await page.goto(`/guides/${id}`);
    await expect(page.getByRole("heading", { name: "Hero not found" })).toBeVisible();
  }
});
