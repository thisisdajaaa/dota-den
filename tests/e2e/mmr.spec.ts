import { expect, test } from "@playwright/test";

test("log, validate, edit and delete MMR entries", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/mmr");
  await expect(page.getByRole("heading", { level: 1, name: "MMR journal" })).toBeVisible();

  // Client-side validation from the shared Zod schema.
  await page.getByRole("button", { name: "Log MMR" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("MMR").fill("20000");
  await dialog.getByRole("button", { name: "Log MMR" }).click();
  await expect(dialog.getByRole("alert")).toContainText("can't be above 15,000");

  await dialog.getByLabel("MMR").fill("5230");
  await dialog.getByLabel("Note (optional)").fill("after a good session");
  await dialog.getByRole("button", { name: "Log MMR" }).click();
  await expect(dialog).toBeHidden();

  // Regression: an entry without a note must save (the form sends note: null).
  await page.getByRole("button", { name: "Log MMR" }).click();
  await page.getByRole("dialog").getByLabel("MMR").fill("5200");
  // Earlier than the next entry, so "current MMR" is unambiguous.
  await page.getByRole("dialog").getByLabel("When you saw it").fill("2026-09-01T10:00");
  await page.getByRole("dialog").getByRole("button", { name: "Log MMR" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const entries = page.getByRole("region", { name: "Your entries" });
  await expect(entries).toContainText("5,200");
  await expect(entries).toContainText("5,230");
  await expect(entries).toContainText("after a good session");
  await expect(page.getByRole("region", { name: "Summary" })).toContainText("5,230");

  await entries.getByRole("button", { name: "Edit entry" }).first().click();
  await page.getByRole("dialog").getByLabel("MMR").fill("5255");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(entries).toContainText("5,255");

  const deleteButtons = entries.getByRole("button", { name: /Delete entry/ });
  for (const remaining of [1, 0]) {
    await deleteButtons.first().click();
    await entries.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(deleteButtons).toHaveCount(remaining);
  }
  await expect(entries).toContainText("No entries yet.");
});

test("MMR API rejects cross-origin and unauthenticated writes", async ({ request }) => {
  const body = { mmr: 5000, observedAt: new Date().toISOString() };
  expect(
    (
      await request.post("/api/v1/mmr-entries", {
        data: body,
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  const baseOrigin = new URL(test.info().project.use.baseURL!).origin;
  expect(
    (
      await request.post("/api/v1/mmr-entries", { data: body, headers: { origin: baseOrigin } })
    ).status(),
  ).toBe(401);
});

test("calendar views and bad params degrade gracefully", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const q of [
    "view=week",
    "view=year",
    "view=all",
    "view=bogus&date=2026-02-30&day=../x&scope=%24ne",
  ]) {
    await page.goto(`/mmr?${q}`);
    await expect(page.getByRole("heading", { level: 1, name: "MMR journal" })).toBeVisible();
  }
});

test("the climb by hero estimates each hero's MMR change, labelled as an estimate", async ({
  page,
}) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/mmr?view=all");
  const climb = page.getByRole("region", { name: "Climb by hero" });
  await expect(climb).toContainText("Dota doesn't report MMR per hero");
  const rows = climb.getByRole("link", { name: /wins?, \d+ loss(es)?, about .* MMR \(estimate\)/ });
  await expect(rows.first()).toBeVisible();
  await expect(
    climb.getByRole("img", { name: /estimated climb, game by game/ }).first(),
  ).toBeVisible();
});
