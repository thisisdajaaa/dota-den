import { expect, test } from "@playwright/test";

// A brand-new identity of its own: the checklist is only for new accounts.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960458888";

test("new players get a checklist that ticks from their data and can be hidden", async ({
  page,
  baseURL,
}) => {
  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  const checklist = page.getByRole("region", { name: "Get started" });
  await expect(checklist).toBeVisible();
  const heroes = checklist.getByRole("link", { name: "Star the heroes you play" });
  await expect(heroes).toHaveAttribute("href", "/patches");

  // Starring a hero ticks the step (it stops being a link).
  const saved = await page.request.put("/api/v1/me/patch-watchlist", {
    data: { heroIds: [1] },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(saved.status()).toBe(200);
  await page.goto("/dashboard");
  await expect(checklist.getByText("Star the heroes you play")).toBeVisible();
  await expect(heroes).toHaveCount(0);

  await checklist.getByRole("button", { name: "Hide the checklist" }).click();
  await expect(checklist).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Weekly goals" })).toBeVisible();
  await expect(checklist).toHaveCount(0);
});
