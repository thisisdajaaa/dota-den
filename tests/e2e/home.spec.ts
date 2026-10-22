import { expect, test } from "@playwright/test";

test("guests see the real product, a player lookup and the latest patch's changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The hero preview is the Meta page with today's (fixture) numbers.
  const preview = page.getByRole("figure", { name: "Preview of the Meta page with today's data" });
  await expect(preview.getByRole("region", { name: "Carries" })).toContainText(/\d+\.\d% win rate/);
  await expect(preview.getByRole("region", { name: "Supports" })).toContainText(/Fixture Hero/);
  await expect(preview.getByRole("link", { name: "Open the Meta" })).toHaveAttribute(
    "href",
    "/meta",
  );

  // Look up a player straight from the hero.
  await expect(page.getByRole("link", { name: /See an example profile/ })).toHaveAttribute(
    "href",
    "/players/321580662",
  );
  const search = page.getByRole("search");
  await search.getByLabel("Or look up any player, no sign-in needed").fill("22202");
  await search.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/players\/22202$/);
  await page.goBack();

  // The latest patch card lists the most-changed heroes in Valve's words.
  const patch = page.getByRole("article", { name: "7.41" });
  await expect(patch.getByRole("link", { name: /Pudge/ })).toHaveAttribute(
    "href",
    "/patches/7.41#hero-14",
  );
  await expect(patch).toContainText("Anti-Mage");
  await expect(
    patch.getByRole("link", { name: "Latest patch 7.41: read the notes" }),
  ).toBeVisible();

  // One row of features, each going somewhere real.
  const features = page.getByRole("region", { name: "One place for your Dota between games" });
  await expect(features.getByRole("link", { name: /Watch live games/ })).toHaveAttribute(
    "href",
    "/live",
  );
  await expect(features.getByRole("link", { name: /Draft practice/ })).toHaveAttribute(
    "href",
    "/draft",
  );
});
