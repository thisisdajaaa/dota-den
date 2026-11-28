import { expect, test } from "@playwright/test";
import { grantPlus } from "./support/grant-plus";

// Its own fixture account: 20 parsed Anti-Mage games with purchase data and match details.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960466001";

test("a hero page shows what works for you, then your timings and lanes as games are read", async ({
  page,
}) => {
  // Free views, then Plus views, then the splits page: longer than the default 30s.
  test.setTimeout(120_000);
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
  // A free player is told the pace, and what Plus changes (Plus is on sale in this server).
  await expect(timings).toContainText("10 more are read each day; Plus reads up to 100.");

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

  // Build check: free players see what Plus adds, with no numbers.
  const check = page.getByRole("region", { name: "Build check vs high-rank" });
  await expect(check).toContainText("With Plus, your item timings on Anti-Mage are checked");
  await expect(check.getByRole("table")).toHaveCount(0);

  // Your splits: free players see what it is, not the numbers.
  await page.goto("/heroes/splits");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your splits");
  await expect(page.getByRole("region", { name: "A Plus feature" })).toContainText("See Plus");
  await expect(page.getByRole("region", { name: "By patch" })).toHaveCount(0);
  await page.goto("/heroes/1");

  // With Plus: the 10 analysed safe-lane games against Legend–Immortal Pos 1 (the fixture's
  // STRATZ, Battle Fury at 15:00). 13:05 is ahead of it, so there's nothing to fix.
  await grantPlus(page, "e2e-build-check");
  await page.reload();
  await expect(check).toContainText(
    "(10 games analysed in this role) against Legend–Immortal pubs at Pos 1 last week (8,000 games)",
  );
  const vs = check.getByRole("table", { name: "Your item timings against high-rank players" });
  await expect(vs.getByRole("row").filter({ hasText: "Battle Fury" })).toContainText(
    "13:05 (10)15:00−1:55",
  );
  await expect(check).toContainText("Nothing stands out to fix.");

  // Your splits with Plus: all 20 games by time of day and length; the 10 read games by
  // position (Anti-Mage in the safe lane: Pos 1) and by lane result (7 won, 3 lost).
  await page.goto("/heroes/splits");
  await expect(page.getByText(/^Overall: .* over 20 games\.$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "By patch" })).toBeVisible();
  await expect(page.getByRole("region", { name: "By time of day" })).toBeVisible();
  await expect(page.getByRole("region", { name: "By game length" })).toBeVisible();
  const positions = page.getByRole("region", { name: "By position" });
  await expect(positions.getByRole("listitem").first()).toContainText("Pos 1");
  await expect(positions.getByRole("listitem").first()).toContainText("10 games");
  await expect(positions).toContainText("From 10 games with a parsed replay");
  const after = page.getByRole("region", { name: "After your lane" });
  await expect(after.getByRole("listitem").filter({ hasText: "You won your lane" })).toContainText(
    "7 games",
  );
  await expect(after.getByRole("listitem").filter({ hasText: "You lost your lane" })).toContainText(
    "3 games",
  );
  await expect(page.getByRole("region", { name: "Lane partners" })).toBeVisible();
  // Gold at 20: ahead in the 7 wins, behind in the 3 losses, each of which led by 12k first.
  const leads = page.getByRole("region", { name: "By gold at 20 minutes" });
  await expect(
    leads.getByRole("listitem").filter({ hasText: "Your team ahead by 3,000+" }),
  ).toContainText("7 games");
  await expect(
    leads.getByRole("listitem").filter({ hasText: "Your team behind by 3,000+" }),
  ).toContainText("3 games");
  await expect(leads).toContainText("Throws: lost 3 of 3 games where your team led by 10,000+.");
  await expect(leads).toContainText("Comebacks: won 0 of 3 games");
  // The same two enemy heroes faced you in the safe lane in all 10 read games.
  const opponents = page.getByRole("region", { name: "Lane opponents" });
  await expect(opponents.getByRole("listitem")).toHaveCount(2);
  await expect(opponents.getByRole("listitem").first()).toContainText("Lanes 7W 0E 3L");

  // Your deaths (free): the 10 read games, 5 deaths each, 13 of them to heroes.
  await page.goto("/heroes/deaths");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your deaths");
  const glance = page.getByRole("region", { name: "Your deaths at a glance" });
  await expect(glance).toContainText("Deaths per game5.0");
  await expect(glance).toContainText("Wins vs losses needs 5 of each (7 wins, 3 losses so far)");
  await expect(glance).toContainText("Deaths before 10:000.3");
  await expect(glance).toContainText("no hero kill on you before 10:00 in 70% of games");
  await expect(glance).toContainText("First death21:40");
  await expect(glance).toContainText("Killed by heroes26%");
  const killers = page.getByRole("region", { name: "Who kills you most" });
  await expect(killers.getByRole("listitem")).toHaveCount(2);
  await expect(killers.getByRole("listitem").first()).toContainText("Fixture Hero 109");
  await expect(killers.getByRole("listitem").first()).toContainText("7 kills in 7 games");
  await expect(killers.getByRole("listitem").nth(1)).toContainText("6 kills in 3 games");
  await expect(page.getByRole("region", { name: "When you die" })).toBeVisible();
});
