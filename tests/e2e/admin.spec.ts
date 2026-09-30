import { expect, test } from "@playwright/test";

test("admins see every user and their activity", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Users and activity" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Totals" })).toContainText("Users");
  const users = page.getByRole("region", { name: "Users" });
  await expect(users.getByRole("link", { name: "Fixture Hero" })).toBeVisible();
  await expect(users).toContainText("admin");
});

test("non-admins don't see the admin page or its link", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login?as=76561197960305729");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" }),
  ).toHaveCount(0);
  // The route streams (signed-in pages have a loading state), so check the page, not the status.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Users and activity" })).toHaveCount(0);

  // Signed out: never the admin page either.
  await page.context().clearCookies();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Users and activity" })).toHaveCount(0);
});
