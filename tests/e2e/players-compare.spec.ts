import { expect, test } from "@playwright/test";

test("compare yourself with a teammate from their profile", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/players/40001");
  await page.getByRole("link", { name: "Compare with you" }).click();
  await expect(page).toHaveURL(/\/players\/compare\?a=22202&b=40001$/);

  const players = page.getByRole("region", { name: "Players" });
  await expect(players.getByRole("link", { name: "Fixture Hero" })).toBeVisible();
  await expect(players.getByRole("link", { name: "Fixture Peer" })).toBeVisible();

  const table = page.getByRole("region", { name: "Side by side" });
  await expect(table).toContainText("Win rate");
  await expect(table).toContainText("58.3%"); // Fixture Hero: 7 wins, 5 losses

  // Fixture Hero's peers list Fixture Peer: 54 games on the same team (28 won), 3 against.
  const h2h = page.getByRole("region", { name: "With and against each other" });
  await expect(h2h).toContainText("54 games together, 28 wins");
  await expect(h2h).toContainText("3 games on opposite teams");
});

test("the compare page asks for two players when one is missing", async ({ page }) => {
  await page.goto("/players/compare?b=40001");
  await expect(page.getByRole("textbox", { name: "Second player" })).toHaveValue("40001");
  await page.getByRole("textbox", { name: "First player" }).fill("22202");
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page).toHaveURL(/a=22202&b=40001/);
  await expect(page.getByRole("region", { name: "Side by side" })).toBeVisible();

  await page.goto("/players/compare?a=22202&b=22202");
  await expect(page.getByRole("alert")).toContainText("two different players");
});
