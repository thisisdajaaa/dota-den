import { expect, test } from "@playwright/test";

const FIXTURE = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 3101}`;
// Its own player, so the games it plays don't touch other specs.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960462001";
const ACCOUNT = 196273;

test("matchups from your own games: toughest and easiest opponents, with sample sizes", async ({
  page,
  request,
}) => {
  const play = (query: string) => request.post(`${FIXTURE}/e2e/play?account=${ACCOUNT}&${query}`);
  // Anti-Mage every game. Five losses against Fixture Heroes 110–114, six wins against
  // 105–109, one win against 120–124 (too few to list) and one loss with no lineup upstream.
  for (let i = 0; i < 5; i++) await play("result=loss&enemies=110");
  for (let i = 0; i < 6; i++) await play("result=win&enemies=105");
  await play("result=win&enemies=120");
  await play("result=loss&lineups=none");

  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Showing 13 of your 13 matches").first()).toBeVisible({
    timeout: 20_000,
  });

  // The heroes page links to the matchups.
  await page.goto("/heroes");
  await page.getByRole("link", { name: "Who you lose to: matchups from your games" }).click();
  await expect(page).toHaveURL(/\/heroes\/matchups$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Who you lose to");

  const opponents = page.getByRole("region", { name: "Your opponents" });
  // The sample: games with lineups out of the games in view, and the reference win rate.
  await expect(opponents).toContainText(
    "Counted from 12 of your 13 games in this view that have both lineups. Your win rate in them: 58.3%.",
  );
  // Nothing is still being read; the game with no lineup is said to be left out.
  await expect(page.getByText("Left out: 1 game with no lineup on OpenDota.")).toBeVisible();

  const toughest = opponents.getByRole("list", { name: "Toughest opponents" });
  await expect(toughest.getByRole("listitem")).toHaveCount(5);
  const first = toughest.getByRole("listitem").first();
  await expect(first).toContainText("Fixture Hero 110");
  await expect(first).toContainText("0.0% · 0–5 · 5 games");
  await expect(first).toContainText("You played: Anti-Mage 0–5");

  const easiest = opponents.getByRole("list", { name: "Easiest opponents" });
  await expect(easiest.getByRole("listitem")).toHaveCount(5);
  await expect(easiest.getByRole("listitem").first()).toContainText("100.0% · 6–0 · 6 games");
  // Heroes met only once are counted, not listed.
  await expect(opponents).not.toContainText("Fixture Hero 120");
  await expect(opponents).toContainText("left out (5 enemy heroes, 0 allied heroes)");

  const allies = page.getByRole("region", { name: "With your allies" });
  await expect(
    allies.getByRole("list", { name: "Allies you win with" }).getByRole("listitem"),
  ).toHaveCount(4);
  await expect(allies).toContainText(
    "No allied hero with 5+ games where you lose more than you win.",
  );

  // Filters: a hero you haven't played gives an honest empty state, not zeros.
  await page.goto("/heroes/matchups?range=30d&hero=14");
  await expect(page.getByRole("heading", { name: "No games with lineups here yet" })).toBeVisible();
  await expect(page.getByText("Try a longer period or all games.")).toBeVisible();

  // Opponents link to their hero pages.
  await page.goto("/heroes/matchups?mode=ranked");
  await page.getByRole("link", { name: "Fixture Hero 110" }).first().click();
  await expect(page).toHaveURL(/\/heroes\/110$/);
});
