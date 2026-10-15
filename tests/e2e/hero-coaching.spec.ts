import { expect, test } from "@playwright/test";

// Its own fixture account: 20 parsed Anti-Mage games with purchase data and match details.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960466001";

test("a hero page shows what works for you, then your timings and lanes as games are read", async ({
  page,
}) => {
  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  // The sign-in sync imports the 20 games, then reads a few match details in the background.
  await expect(page.getByText("Showing 20 of your 20 matches").first()).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/heroes/1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Anti-Mage");

  // Win rate with and without each item, from the 20 games with purchase data. Battle Fury is
  // bought every game (nothing to compare), consumables and components are left out.
  const works = page.getByRole("region", { name: "What works for you" });
  await expect(works).toContainText("from 20 games with purchase data on Anti-Mage");
  const rows = works.getByRole("list", { name: "Win rate with and without each item" });
  await expect(rows.getByRole("listitem")).toHaveCount(1);
  await expect(rows.getByRole("listitem").first()).toContainText("Manta Style");
  await expect(rows.getByRole("listitem").first()).toContainText(
    "Bought: 80.0% · 10 games · Not bought: 30.0% · 10 games",
  );
  await expect(rows.getByRole("listitem").first()).toContainText("+50.0 pts");
  await expect(works).toContainText("not a cause");
  await expect(works).not.toContainText("Battle Fury");
  await expect(works).not.toContainText("Tango");

  // Timings and lanes: 10 match details a day, newest parsed games first. The background read
  // may still be running, so reload until it has finished.
  const timings = page.getByRole("region", { name: "Your timings and lanes" });
  await expect(async () => {
    await page.reload();
    await expect(timings).toContainText(
      "10 of your 20 games with parsed replays on Anti-Mage analysed so far",
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 30_000 });

  // The 10 newest games: 7 wins, 3 losses. Battle Fury at 13:03 in wins, 16:07 in losses;
  // Manta has only one loss, too few for a typical time.
  const table = timings.getByRole("table", { name: "Item timings in wins and losses" });
  const bfury = table.getByRole("row").filter({ hasText: "Battle Fury" });
  await expect(bfury).toContainText("13:03 (7)");
  await expect(bfury).toContainText("16:07 (3)");
  const manta = table.getByRole("row").filter({ hasText: "Manta Style" });
  await expect(manta).toContainText("25:03 (4)");
  await expect(manta).toContainText("— (1)");

  const lanes = timings.getByRole("list", { name: "Lane results by role" });
  await expect(lanes.getByRole("listitem")).toHaveCount(1);
  await expect(lanes.getByRole("listitem").first()).toContainText(
    "Safe lane10 games · 7 won · lane 7 won, 0 even, 3 lost · lane efficiency 80%",
  );
  await expect(timings).toContainText("Correlation, not cause");

  // Another sync (or its cooldown) reads no more match details: the daily cap is used up.
  const sync = await page.request.post("/api/v1/me/matches/sync", {
    headers: { origin: new URL(page.url()).origin },
  });
  expect([200, 429]).toContain(sync.status());
  await page.reload();
  await expect(timings).toContainText("10 of your 20 games");

  // The stored extras are part of "Download your data".
  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.matchExtras).toHaveLength(10);
  expect(exported.matchExtras[0]).toMatchObject({
    heroId: 1,
    laneRole: 1,
    itemTimings: expect.arrayContaining([expect.objectContaining({ key: "bfury" })]),
  });
});
