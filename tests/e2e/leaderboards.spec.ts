import { expect, test, type Page } from "@playwright/test";

// A second synthetic identity (the fixture's "Fixture Peer", account 40001). The default
// identity is "Fixture Hero" (account 22202).
const FRIEND_STEAM_ID = "76561197960305729";
const HERO_ACCOUNT = 22202;

function board(page: Page, name: string) {
  return page.getByRole("region", { name: `${name} leaderboard` });
}

test("a friend sees your challenge answers and finished drafts on the leaderboards", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const hero = await browser.newContext();
  const friend = await browser.newContext();
  const heroPage = await hero.newPage();
  const friendPage = await friend.newPage();
  await heroPage.goto("/api/v1/auth/steam/login");
  await friendPage.goto(`/api/v1/auth/steam/login?as=${FRIEND_STEAM_ID}`);

  // The friend tracks Fixture Hero, so they're on each other's friends boards.
  const tracked = await friend.request.post("/api/v1/me/follows", {
    data: { accountId32: HERO_ACCOUNT },
    headers: { origin },
  });
  expect([200, 201]).toContain(tracked.status());

  // Nav link, then an honest empty board before anyone has played.
  await friendPage.goto("/players");
  await friendPage
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Leaderboards" })
    .click();
  await expect(friendPage).toHaveURL(/\/leaderboards$/);
  await expect(friendPage.getByRole("heading", { level: 1, name: "Leaderboards" })).toBeVisible();
  const emptyDrafts = board(friendPage, "Draft games");
  await expect(emptyDrafts).toContainText("None of your friends have played yet this week.");
  await expect(emptyDrafts.getByRole("link", { name: "/draft/rooms/new" })).toBeVisible();

  // Fixture Hero answers a challenge; signed in, the streak comes from the account.
  const seed = `e2elb${Date.now().toString(36)}`.slice(0, 24);
  await heroPage.goto(`/draft/challenges/last_pick?seed=${seed}`);
  const grid = heroPage.getByRole("region", { name: "Heroes", exact: true });
  await grid
    .getByRole("button", { name: /^pick / })
    .first()
    .click();
  const grade = heroPage.waitForResponse("**/api/v1/drafts/challenges/grade");
  await heroPage.getByRole("button", { name: "Lock in pick" }).click();
  const graded = await (await grade).json();
  expect(graded.saved).toMatchObject({ counted: true });
  await expect(heroPage.getByRole("region", { name: "Result" })).toContainText("Your grade");

  // Answering the same puzzle again doesn't count twice.
  const repeat = await hero.request.post("/api/v1/drafts/challenges/grade", {
    data: {
      type: "last_pick",
      seed,
      heroIds: graded.choices.map((c: { heroId: number }) => c.heroId),
    },
    headers: { origin },
  });
  expect((await repeat.json()).saved).toMatchObject({ counted: false });

  await heroPage.goto("/draft/challenges");
  await expect(heroPage.getByRole("region", { name: "Your progress" })).toContainText(
    "saved to your account",
  );

  // Fixture Hero finishes a "Simple practice" draft against the AI captain (you: Radiant).
  await heroPage.goto("/draft");
  await heroPage.getByRole("combobox", { name: "Ruleset" }).click();
  await heroPage.getByRole("option", { name: "Simple practice" }).click();
  await heroPage.getByRole("button", { name: "Start draft" }).click();
  const heroes = heroPage.getByRole("region", { name: "Heroes" });
  const saved = heroPage.waitForResponse("**/api/v1/drafts/results");
  // 8 alternating bans, then 10 alternating picks; Radiant (you) first, the AI replies.
  for (let step = 0; step < 18; step += 2) {
    await expect(heroPage.getByText(`Step ${step + 1} of 18`, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const action = step < 8 ? "ban" : "pick";
    const button = heroes.getByRole("button", { name: new RegExp(`^${action} `) }).first();
    await expect(button).toBeEnabled();
    await button.click();
  }
  await expect(heroPage.getByText("Draft complete", { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  const result = await saved;
  expect(result.status()).toBe(201);
  await expect(heroPage.getByText("Draft saved to your leaderboards")).toBeVisible();

  // Submitting the same finished draft again doesn't count twice.
  const again = await hero.request.post("/api/v1/drafts/results", {
    data: { snapshot: JSON.parse(result.request().postData()!).snapshot, aiSide: "dire" },
    headers: { origin },
  });
  expect(again.status()).toBe(200);
  const body = (await again.json()).data;
  expect(body).toMatchObject({ counted: false, mode: "ai", side: "radiant" });
  expect(body.score === null || (body.score >= 0 && body.score <= 100)).toBe(true);

  // The friend now sees Fixture Hero on both boards.
  await friendPage.goto("/leaderboards?board=drafts&scope=friends&period=week");
  const drafts = board(friendPage, "Draft games");
  const heroDraftRow = drafts.getByRole("listitem", { name: /^Rank \d+: Fixture Hero$/ });
  await expect(heroDraftRow).toBeVisible();
  await expect(heroDraftRow).toContainText(/Drafts\s*1/);
  await expect(heroDraftRow.getByRole("img", { name: /Immortal/ })).toBeVisible();

  await friendPage
    .getByRole("navigation", { name: "Leaderboard" })
    .getByRole("link", { name: "Draft challenges" })
    .click();
  await expect(friendPage).toHaveURL(/board=challenges/);
  const challenges = board(friendPage, "Draft challenges");
  await expect(
    challenges.getByRole("listitem", { name: /^Rank \d+: Fixture Hero$/ }),
  ).toContainText("of 1 answer");
  await expect(challenges).toContainText("Only your first answer to each puzzle counts.");

  // Fixture Hero sees themselves highlighted as "You", on the everyone board too.
  await heroPage.goto("/leaderboards?board=drafts&scope=everyone&period=all");
  const own = board(heroPage, "Draft games").getByRole("listitem", {
    name: /^Rank \d+: Fixture Hero \(you\)$/,
  });
  await expect(own).toContainText("You");

  // Profiles are private by default: the friend doesn't see Fixture Hero on Everyone until
  // Fixture Hero opts in.
  await friendPage.goto("/leaderboards?board=drafts&scope=everyone&period=all");
  const heroOnEveryone = board(friendPage, "Draft games").getByRole("listitem", {
    name: /^Rank \d+: Fixture Hero$/,
  });
  await expect(heroOnEveryone).toHaveCount(0);
  const toggle = heroPage.getByRole("checkbox", { name: /Show me on the Everyone boards/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(heroPage.getByText("You're listed on the Everyone boards.")).toBeVisible();
  await friendPage.reload();
  await expect(heroOnEveryone).toBeVisible();

  // Friend rooms: results are labelled as self-reported.
  await heroPage.goto("/leaderboards?board=rooms");
  await expect(board(heroPage, "Friend rooms")).toContainText("self-reported");

  // The overview shows your standing among friends.
  await heroPage.goto("/dashboard");
  const standing = heroPage.getByRole("region", { name: "Your standing" });
  await expect(standing).toContainText("Draft games");
  await expect(standing).toContainText(/#\d+/);

  await hero.close();
  await friend.close();
});

test("the draft results API checks origin, sign-in and the draft", async ({ page, request }) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const cross = await request.post("/api/v1/drafts/results", {
    data: { snapshot: "e30", aiSide: "dire" },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  const signedOut = await request.post("/api/v1/drafts/results", {
    data: { snapshot: "e30", aiSide: "dire" },
    headers: { origin },
  });
  expect(signedOut.status()).toBe(401);

  await page.goto("/api/v1/auth/steam/login");
  const post = (data: unknown) =>
    page.request.post("/api/v1/drafts/results", { data, headers: { origin } });
  expect((await post({ snapshot: "garbage!", aiSide: "dire" })).status()).toBe(400);
  expect((await post({ snapshot: "e30", aiSide: "sideways" })).status()).toBe(400);
  // A valid but unfinished draft (nothing picked yet) doesn't count.
  const empty = Buffer.from(
    JSON.stringify({ v: 1, r: "practice-simple", rv: 1, f: "radiant", t: [] }),
  ).toString("base64url");
  const unfinished = await post({ snapshot: empty, aiSide: null });
  expect(unfinished.status()).toBe(400);
  expect((await unfinished.json()).details.reason).toBe("not_completed");
});

test("leaderboards are for signed-in players", async ({ page }) => {
  await page.goto("/leaderboards");
  await expect(page).toHaveURL(/auth_error=signed_out/);
});

test("ranked this week lists you and your friends by wins minus losses", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await page.goto("/leaderboards");
  const week = page.getByRole("region", { name: "Ranked this week" });
  // Fixture: the signed-in player is 7–5 in ranked.
  const me = week.getByRole("listitem").filter({ hasText: "(you)" });
  await expect(me).toContainText("7–5");
  await expect(me).toContainText("≈ +50");
  await expect(week).toContainText("±25-per-game estimate");
});
