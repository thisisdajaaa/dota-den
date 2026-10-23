import { expect, test, type Page } from "@playwright/test";

// The AI match coach (ADR 0014) with the fixture's stand-in for Groq. Its own identity: three
// Anti-Mage games, the newest two parsed. Free plan: one new review per rolling 7 days.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960468001";
const FIXTURE = `http://localhost:${process.env.FIXTURE_PORT ?? 3101}`;
const PARSED = "7400000003";
const ALSO_PARSED = "7400000002";
const UNPARSED = "7400000001";

async function modelCalls(page: Page): Promise<number> {
  return (await (await page.request.get(`${FIXTURE}/groq/calls`)).json()).calls;
}

const coach = (page: Page) => page.getByRole("region", { name: "Coaching points" });

test("the owner gets a grounded coach review; the free one is weekly and reopening is free", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Showing 3 of your 3 matches").first()).toBeVisible({
    timeout: 20_000,
  });

  // A parsed match of your own: write the review.
  await page.goto(`/matches/${PARSED}`);
  const card = coach(page);
  await expect(card).toContainText("AI coach");
  await expect(card.getByTestId("coach-quota")).toHaveText("1 free review left this week");
  const before = await modelCalls(page);
  const write = card.getByRole("button", { name: "Write my review" });
  // Right after navigation the button may not be hydrated yet: retry until it answers.
  await expect(async () => {
    if ((await write.count()) > 0) await write.click({ timeout: 2_000 });
    await expect(card.getByRole("listitem").first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  const points = card.getByRole("listitem", { name: /./ });
  await expect(points).toHaveCount(3);
  const lastHits = card.getByRole("listitem", { name: "Clean last hitting in lane" });
  await expect(lastHits).toContainText("Strength");
  // The numbers next to a point come from our data, not the model's text.
  const facts = lastHits.getByRole("definition");
  await expect(facts).toHaveText("50");
  await expect(lastHits).toContainText("Last hits at 10:00");
  await expect(card.getByRole("listitem", { name: "Get Battle Fury sooner" })).toContainText(
    "Battle Fury18:20",
  );
  // Missing data is said, never guessed: party size isn't recorded for these games.
  await expect(card).toContainText("Not available for this match: party status (unknown)");
  await expect(card).toContainText("It can be wrong");
  await expect(card.getByTestId("coach-quota")).toHaveText("You've used this week's free review.");
  expect(await modelCalls(page)).toBe(before + 1);
  // Written in the viewer's language (English here).
  expect((await (await page.request.get(`${FIXTURE}/groq/calls`)).json()).lastLanguage).toBe("en");

  // A second parsed match within the week: the upsell instead of the button.
  await page.goto(`/matches/${ALSO_PARSED}`);
  const locked = coach(page);
  await expect(locked).toContainText("You've used this week's free review.");
  await expect(locked).toContainText("Next free review:");
  await expect(locked.getByRole("link", { name: /See Dota Den Plus/ })).toHaveAttribute(
    "href",
    "/plus",
  );
  await expect(locked.getByRole("button", { name: "Write my review" })).toHaveCount(0);
  const refused = await page.request.post(`/api/v1/matches/${ALSO_PARSED}/coach`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(refused.status()).toBe(429);
  expect((await refused.json()).details.reason).toBe("quota");

  // The stored review reopens without a model call and without counting.
  await page.goto(`/matches/${PARSED}`);
  await expect(coach(page).getByRole("listitem", { name: /./ })).toHaveCount(3);
  const again = await page.request.post(`/api/v1/matches/${PARSED}/coach`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(again.status()).toBe(200);
  expect((await again.json()).data.cached).toBe(true);
  expect(await modelCalls(page)).toBe(before + 1);

  // Unparsed: the coach explains it needs the parse, and offers the request.
  await page.goto(`/matches/${UNPARSED}`);
  const unparsed = coach(page);
  await expect(unparsed).toContainText("needs parsing first");
  await expect(unparsed.getByRole("button", { name: "Get detailed stats" })).toBeVisible();

  // Someone else's match: no coach.
  await page.goto("/matches/7000000012");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(coach(page)).toHaveCount(0);

  // The review and the quota record are part of "Download your data".
  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.coachReviews).toHaveLength(1);
  expect(exported.coachReviews[0]).toMatchObject({ matchId: PARSED, accountId32: 202273 });
  expect(exported.coachReviewUses).toHaveLength(1);
});
