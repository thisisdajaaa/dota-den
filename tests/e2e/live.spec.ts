import { expect, test } from "@playwright/test";

test("live games list league and top public games, with a live read of the draft", async ({
  page,
}) => {
  await page.goto("/live");
  await expect(page.getByRole("heading", { level: 1, name: "Live games" })).toBeVisible();
  const league = page.getByRole("region", { name: "League games" });
  await expect(league).toContainText("Fixture Invitational");
  await expect(league).toContainText("Fixture Falcons vs Fixture Titans");
  await expect(league).toContainText("Radiant leads by 8.4k gold");
  await expect(league).toContainText("feed 15 min behind");
  await expect(page.getByRole("region", { name: "Highest-MMR public games" })).toContainText(
    "Average MMR 8,150",
  );

  await league.getByRole("link", { name: /Fixture Falcons vs Fixture Titans/ }).click();
  await expect(page).toHaveURL(/\/live\/8000000001$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixture Falcons vs Fixture Titans" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Lineups" })).toContainText("Ace");
  // Where to watch: streams naming the game, played in the page (Twitch's player is stubbed).
  await page.route("https://player.twitch.tv/**", (r) => r.fulfill({ body: "" }));
  const watch = page.getByRole("region", { name: "Watch" });
  await expect(watch).toContainText("FixtureCasts");
  await expect(watch).not.toContainText("RankedGrinder");
  await expect(
    watch.getByRole("link", { name: /Search Twitch for “Fixture Falcons vs Fixture Titans”/ }),
  ).toHaveAttribute(
    "href",
    "https://www.twitch.tv/search?term=Fixture%20Falcons%20vs%20Fixture%20Titans",
  );
  await watch.getByRole("button", { name: "Watch FixtureCasts here" }).click();
  await expect(watch.locator("iframe")).toHaveAttribute(
    "src",
    /^https:\/\/player\.twitch\.tv\/\?channel=fixturecasts&parent=localhost/,
  );
  await watch.getByRole("button", { name: "Close player" }).click();
  await expect(watch.locator("iframe")).toHaveCount(0);

  const read = page.getByRole("region", { name: "The draft" });
  await expect(
    read.getByRole("img", { name: /Estimated win chance from the draft/ }),
  ).toBeVisible();
  await expect(read).toContainText("Lanes");

  // The public game hasn't finished drafting: no analysis yet.
  await page.goto("/live/8000000002");
  await expect(page.getByText("appears once both teams have picked all five heroes")).toBeVisible();

  // A game that isn't live anymore points to the match page.
  await page.goto("/live/123");
  await expect(page.getByRole("heading", { name: "This game isn't live anymore" })).toBeVisible();
});
