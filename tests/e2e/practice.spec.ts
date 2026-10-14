import { expect, test } from "@playwright/test";

// The fixture account (12 synced ranked matches) for the plan; its own identity for the API.
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960462701";

test("the overview suggests a practice plan you can review, swap and dismiss", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page.getByText("Showing 12 of your 12 matches").first()).toBeVisible({
    timeout: 20_000,
  });
  // The plan is built from synced games, so look again once the sync is in.
  await page.reload();
  const card = page.getByRole("region", { name: "Practice plan" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  const steps = card.getByRole("listitem");

  // A hero from the pool advice, with the numbers behind it.
  const hero = steps.filter({ hasText: /in 3 ranked games/ });
  await expect(hero).toHaveCount(1);
  await expect(hero).toContainText(/\d+%|Pos \d/);
  const heroLabel = (await hero.locator("p").first().textContent()) ?? "";

  // The latest ranked loss, linked to its match; tagging it "reviewed" ticks the step.
  const review = card.getByRole("link", { name: /^Review your .* loss from/ });
  await expect(review).toHaveAttribute("href", "/matches/7000000010");
  await expect(card.getByText("Not reviewed yet")).toBeVisible();
  await review.click();
  await expect(page).toHaveURL(/\/matches\/7000000010$/);
  const notes = page.getByRole("region", { name: "Your notes" });
  await notes.getByRole("button", { name: "+ reviewed" }).click();
  await notes.getByRole("button", { name: "Save" }).click();
  await expect(notes.getByRole("button", { name: "Saved" })).toBeDisabled();

  await page.goto("/dashboard");
  await expect(card.getByText("Reviewed", { exact: true })).toBeVisible();

  // Swap the hero for the next suggestion, then dismiss the review step.
  const index = await steps.evaluateAll((items) =>
    items.findIndex((li) => /in 3 ranked games/.test(li.textContent ?? "")),
  );
  await card.getByRole("button", { name: `Swap step ${index + 1}` }).click();
  await expect(card.getByText(heroLabel, { exact: true })).toHaveCount(0);
  await expect(steps.filter({ hasText: /in 3 ranked games/ })).toHaveCount(1);

  const count = await steps.count();
  const reviewIndex = await steps.evaluateAll((items) =>
    items.findIndex((li) => /^Review your/.test(li.textContent ?? "")),
  );
  await card.getByRole("button", { name: `Dismiss step ${reviewIndex + 1}` }).click();
  await expect(steps).toHaveCount(count - 1);
  await page.reload();
  await expect(card.getByRole("link", { name: /^Review your/ })).toHaveCount(0);
});

test("plan changes need a session, the same origin and a known step", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const patch = (data: unknown, headers: Record<string, string> = { origin }) =>
    request.patch("/api/v1/me/practice-plan", { data, headers });
  expect((await patch({ action: "dismiss", stepId: "logMmr" }, {})).status()).toBe(403);
  expect((await patch({ action: "dismiss", stepId: "logMmr" })).status()).toBe(401);
  await request.get(API_LOGIN);
  const bad = await patch({ action: "skip", stepId: "logMmr" });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({ success: false, code: "bad_request", data: null });
  // No games yet, so no plan this week.
  const none = await patch({ action: "dismiss", stepId: "logMmr" });
  expect(none.status()).toBe(404);
  expect(await none.json()).toMatchObject({ success: false, code: "not_found" });
});
