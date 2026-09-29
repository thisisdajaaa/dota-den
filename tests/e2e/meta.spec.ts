import { expect, test } from "@playwright/test";

test("guests pick a role and see ranked heroes, lane duos and patch info", async ({ page }) => {
  await page.goto("/meta");
  await expect(
    page.getByRole("heading", { level: 1, name: "What's strong right now" }),
  ).toBeVisible();
  // Guests have no derived role.
  await expect(page.getByRole("region", { name: "Your role" })).toHaveCount(0);

  await page
    .getByRole("navigation", { name: "Choose your role" })
    .getByRole("link", { name: /Safe lane carry/ })
    .click();
  await expect(page).toHaveURL(/\/meta\?pos=1$/);

  const heroes = page.getByRole("region", { name: "Top heroes: Safe lane carry" });
  const rows = heroes.getByRole("listitem");
  await expect(rows.first()).toContainText("win rate at high ranks");
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await expect(rows.first()).toContainText(/Safe lane: \d+\.\d% win rate · [\d,]+ games/);
  await expect(rows.first()).toContainText(
    /Tournaments: [\d,]+ picks? · [\d,]+ bans? in 120 pro drafts/,
  );
  // The named fixture heroes sit at 48% and never top the list.
  await expect(rows.first()).not.toContainText("Anti-Mage");
  await expect(heroes).toContainText("Tournaments: 120 pro drafts in the last 21 days");

  const duos = page.getByRole("region", { name: "Strongest lane duos" });
  await expect(duos).toContainText("in pro matches over the last 60 days");
  await expect(duos.getByRole("listitem").first()).toContainText(
    /Fixture Hero \d+ \+ Fixture Hero \d+/,
  );
  await expect(duos.getByRole("listitem").first()).toContainText(/win rate · \d+ games/);
  // Pairs under 8 games are left out.
  await expect(duos).not.toContainText("Fixture Hero 101 + Fixture Hero 102");

  const tips = page.getByRole("region", { name: "Patch tips" });
  await expect(tips).toContainText("Patch 7.41");
  await expect(page.getByRole("link", { name: "7.41" })).toHaveAttribute("href", "/patches/7.41");

  // Switching role with the tabs.
  await page
    .getByRole("navigation", { name: "Position" })
    .getByRole("link", { name: /Mid/ })
    .click();
  await expect(page).toHaveURL(/\/meta\?pos=2$/);
  await expect(page.getByRole("region", { name: "Top heroes: Mid" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Strongest lane duos" })).toContainText(
    "Mid is a solo lane",
  );
});

test("signed-in users see the role derived from their recent lanes", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/meta");

  const role = page.getByRole("region", { name: "Your role" });
  // Fixture history: 8 safe-lane Anti-Mage games and 4 off-lane Pudge games.
  await expect(role).toContainText("Pos 1 · Safe lane carry");
  await expect(role).toContainText("Based on your last 12 games with lane data");
  await expect(role.getByRole("list", { name: "Games by position" })).toContainText(
    "Pos 3: 4 games",
  );

  const tabs = page.getByRole("navigation", { name: "Position" });
  await expect(tabs.getByRole("link", { name: /Safe lane carry \(you\)/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Top heroes: Safe lane carry" })).toBeVisible();
});
