import { expect, test } from "@playwright/test";

test("the overview lists your teammates with honest comparisons and a rival", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/dashboard");

  const section = page.getByRole("region", { name: "Teammates" });
  await expect(section.getByRole("heading", { name: "Who you play with" })).toBeVisible();

  const highlights = section.getByRole("region", { name: "Teammate highlights" });
  await expect(highlights).toContainText("Most played with");
  await expect(highlights).toContainText("Fixture Peer");
  // Only ever an opponent: a rival, never a teammate.
  await expect(highlights).toContainText("Fixture Rival");

  const list = section.getByRole("region", { name: "Who you play with" });
  await expect(list.getByRole("link", { name: "Fixture Peer" }).first()).toBeVisible();
  await expect(list.getByRole("link", { name: "Fixture Duo" }).first()).toBeVisible();
  await expect(list).not.toContainText("Fixture Rival");
  await expect(list).toContainText("on your team");

  // Sorting keeps working without a reload.
  const byWinRate = section
    .getByRole("radiogroup", { name: "Sort teammates by" })
    .getByRole("radio", { name: /win rate/i });
  await byWinRate.click();
  await expect(byWinRate).toHaveAttribute("aria-checked", "true");
  await expect(list.getByRole("link", { name: "Fixture Peer" }).first()).toBeVisible();
});

test("open a friend from Together and see your games as a pair", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/together");
  await expect(page.getByRole("region", { name: "Best stacks" })).toBeVisible();
  const friends = page.getByRole("region", { name: "People you play with" });
  await friends
    .getByRole("link", { name: /Fixture Peer/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/together\/40001$/);
  const pair = page.getByRole("region", { name: "Pair" });
  await expect(pair.getByRole("heading", { level: 1 })).toContainText("Fixture Peer");
  await expect(page.getByRole("region", { name: "Together stats" })).toBeVisible();
});

test("together pages need you signed in and a real account id", async ({ page }) => {
  await page.goto("/together");
  await expect(page).not.toHaveURL(/\/together$/);

  await page.goto("/api/v1/auth/steam/login");
  // The route streams (it has a loading state), so check the page rather than the status.
  await page.goto("/together/not-a-number");
  await expect(page.getByRole("heading", { name: "Player not found" })).toBeVisible();
});
