import { expect, test, type Page } from "@playwright/test";

// Its own identity: tests run in parallel and follows are per user.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960477001";

/** Never load Twitch or Kick (or their images) from tests: the players and chats are stubbed. */
async function stubTwitch(page: Page) {
  await page.route("https://player.twitch.tv/**", (r) => r.fulfill({ body: "" }));
  await page.route("https://www.twitch.tv/**", (r) => r.fulfill({ body: "" }));
  await page.route("https://static-cdn.jtvnw.net/**", (r) => r.fulfill({ status: 404 }));
  await page.route("https://player.kick.com/**", (r) => r.fulfill({ body: "" }));
  await page.route("https://kick.com/**", (r) => r.fulfill({ body: "" }));
  await page.route("https://*.kick.com/**", (r) => r.fulfill({ status: 404 }));
}

/** Clicks until the click has an effect: a click before hydration does nothing. */
async function clickUntil(page: Page, click: () => Promise<void>, done: () => Promise<void>) {
  await expect(async () => {
    await click();
    await done();
  }).toPass({ timeout: 30_000 });
}

test("guests browse live streams, filter by language and watch one in the page", async ({
  page,
}) => {
  await stubTwitch(page);
  await page.goto("/live");
  await expect(page.getByRole("heading", { level: 1, name: "Watch live" })).toBeVisible();
  // Signing in is what following needs.
  await expect(
    page.getByRole("region", { name: "Follow your favourite streamers" }).getByRole("link", {
      name: "Sign in with Steam",
    }),
  ).toBeVisible();

  const streams = page.getByRole("region", { name: "Live now" });
  const cards = streams.getByRole("button", { name: /^Watch / });
  // Most watched first.
  await expect(cards.first()).toHaveAccessibleName("Watch RankedGrinder");
  await expect(cards.nth(1)).toHaveAccessibleName("Watch FixtureCasts");
  await expect(streams).toContainText("Showing 12 of 30 streams");
  await expect(streams).toContainText("30K watching");
  // The live game a title mentions, labelled as a guess.
  const guess = streams.getByRole("link", {
    name: "Fixture Falcons vs Fixture Titans: open the live game (a guess from the stream title)",
  });
  await expect(guess).toHaveAttribute("href", "/live/8000000001");
  await expect(streams.getByText("Guessed from the title")).toHaveCount(1);

  await clickUntil(
    page,
    () => streams.getByRole("button", { name: "Show 12 more" }).click({ timeout: 2_000 }),
    () => expect(streams).toContainText("Showing 24 of 30 streams", { timeout: 3_000 }),
  );
  await streams.getByRole("button", { name: "Show 6 more" }).click();
  await expect(streams).toContainText("Showing 30 of 30 streams");
  await expect(streams.getByRole("button", { name: /^Show \d+ more$/ })).toHaveCount(0);
  // Twitch says "tl" and Kick "fil": one Filipino option holds both.
  await streams.getByLabel("Language").selectOption("fil");
  await expect(streams).toContainText("Showing 2 of 2 streams");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAccessibleName("Watch PinoyDota");
  await streams.getByLabel("Language").selectOption("");

  // Watch in the page: the URL links to it, the player and chat name this host.
  await streams.getByRole("button", { name: "Watch FixtureCasts" }).click();
  await expect(page).toHaveURL(/\/live\?watch=fixturecasts$/);
  const player = page.getByRole("region", { name: "FixtureCasts" });
  await expect(player.locator('iframe[title="FixtureCasts on Twitch"]')).toHaveAttribute(
    "src",
    "https://player.twitch.tv/?channel=fixturecasts&parent=localhost&autoplay=true",
  );
  await expect(player.locator('iframe[title="FixtureCasts chat on Twitch"]')).toHaveAttribute(
    "src",
    "https://www.twitch.tv/embed/fixturecasts/chat?parent=localhost&darkpopout",
  );
  await expect(player).toContainText("Guessed from the title");
  await player.getByRole("button", { name: "Hide chat" }).click();
  await expect(player.locator('iframe[title="FixtureCasts chat on Twitch"]')).toBeHidden();
  await player.getByRole("button", { name: "Close player" }).click();
  await expect(page).toHaveURL(/\/live$/);
  await expect(page.locator('iframe[title="FixtureCasts on Twitch"]')).toHaveCount(0);

  // A deep link opens the player straight away.
  await page.goto("/live?watch=pinoydota");
  await expect(page.getByRole("heading", { level: 2, name: "PinoyDota" })).toBeVisible();
  await expect(page.locator('iframe[title="PinoyDota on Twitch"]')).toHaveAttribute(
    "src",
    /channel=pinoydota&parent=localhost/,
  );
});

test("Kick streams play in Kick's player and Kick channels can be followed", async ({ page }) => {
  await stubTwitch(page);
  await page.goto("/api/v1/auth/steam/login?as=76561197960477003");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/live");

  // In the grid among Twitch's, badged; mature streams are left out.
  const streams = page.getByRole("region", { name: "Live now" });
  const card = streams
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: "Watch kickcaster" }) });
  await expect(card).toContainText("Kick");
  await expect(card).toContainText("5K watching");
  await expect(streams.getByRole("button", { name: "Watch mature_kick" })).toHaveCount(0);

  // Kick's player, and a link to its chat (Kick has no chat embed).
  await clickUntil(
    page,
    () => card.getByRole("button", { name: "Watch kickcaster" }).click({ timeout: 2_000 }),
    () => expect(page).toHaveURL(/\/live\?watch=kick(:|%3A)kickcaster$/, { timeout: 3_000 }),
  );
  const player = page.getByRole("region", { name: "kickcaster" });
  await expect(player.locator('iframe[title="kickcaster on Kick"]')).toHaveAttribute(
    "src",
    "https://player.kick.com/kickcaster",
  );
  await expect(player.getByRole("link", { name: "Open chat on Kick" })).toHaveAttribute(
    "href",
    "https://kick.com/kickcaster",
  );
  await expect(player.getByRole("button", { name: /chat/i })).toHaveCount(0);

  // Follow it from the grid, and an offline Kick channel found by its exact name.
  const following = page.getByRole("region", { name: "Following" });
  await streams.getByRole("button", { name: "Follow kickcaster" }).click();
  await expect(following.getByRole("button", { name: "Watch kickcaster (live)" })).toBeVisible();
  const search = page.getByRole("region", { name: "Find a streamer" });
  await expect(search).toContainText("On Kick, type the exact channel name.");
  await search.getByRole("searchbox", { name: "Search channels" }).fill("kickoffline");
  const results = search.getByRole("list", { name: "Channels matching “kickoffline”" });
  await expect(results.getByRole("link", { name: "Open kickoffline on Kick" })).toHaveAttribute(
    "href",
    "https://kick.com/kickoffline",
  );
  await results.getByRole("button", { name: "Follow kickoffline" }).click();
  await expect(following.getByRole("link", { name: /kickoffline is offline/ })).toBeVisible();

  const saved = await (await page.request.get("/api/v1/me/streamers")).json();
  expect(
    saved.data.channels.map(
      (c: { platform: string; channelId: string; login: string; status: string }) => [
        c.platform,
        c.channelId,
        c.login,
        c.status,
      ],
    ),
  ).toEqual([
    ["kick", "7001", "kickcaster", "live"],
    ["kick", "7100", "kickoffline", "offline"],
  ]);

  // A deep link plays a Kick channel straight away.
  await page.goto("/live?watch=kick:kick_pinoy");
  await expect(page.locator('iframe[title="kick_pinoy on Kick"]')).toHaveAttribute(
    "src",
    "https://player.kick.com/kick_pinoy",
  );
});

test("search finds live and offline channels", async ({ page }) => {
  await stubTwitch(page);
  await page.goto("/live");
  const search = page.getByRole("region", { name: "Find a streamer" });
  const box = search.getByRole("searchbox", { name: "Search channels" });

  await box.fill("legend");
  const results = search.getByRole("list", { name: "Channels matching “legend”" });
  await expect(results).toContainText("FixtureLegend");
  await expect(results).toContainText("Offline");
  await expect(results.getByRole("link", { name: "Open FixtureLegend on Twitch" })).toHaveAttribute(
    "href",
    "https://www.twitch.tv/fixturelegend",
  );
  await expect(results.getByRole("button", { name: /Watch FixtureLegend/ })).toHaveCount(0);

  await box.fill("nobody-here");
  await expect(search).toContainText("No channels found for “nobody-here”.");

  // A live channel streaming something else still plays here.
  await box.fill("chatty");
  await search.getByRole("button", { name: "Watch ChattyFixture here" }).click();
  await expect(page).toHaveURL(/\?watch=chattyfixture$/);
  await expect(page.getByRole("heading", { level: 2, name: "ChattyFixture" })).toBeVisible();
  await expect(page.locator('iframe[title="ChattyFixture on Twitch"]')).toHaveAttribute(
    "src",
    /channel=chattyfixture&parent=localhost/,
  );
});

test("signed-in users follow streamers and see them in Following, live first", async ({ page }) => {
  await stubTwitch(page);
  await page.goto(LOGIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/live");
  const following = page.getByRole("region", { name: "Following" });
  await expect(following).toContainText("You aren't following any streamers yet");

  // Follow an offline channel from search.
  const search = page.getByRole("region", { name: "Find a streamer" });
  await search.getByRole("searchbox", { name: "Search channels" }).fill("legend");
  const followLegend = search.getByRole("button", { name: "Follow FixtureLegend" });
  await clickUntil(
    page,
    () => followLegend.click({ timeout: 2_000 }),
    () =>
      expect(following.getByRole("link", { name: /FixtureLegend is offline/ })).toBeVisible({
        timeout: 3_000,
      }),
  );

  // Follow a live one from the grid.
  const streams = page.getByRole("region", { name: "Live now" });
  await streams.getByRole("button", { name: "Follow FixtureCasts" }).click();
  await expect(streams.getByRole("button", { name: "Unfollow FixtureCasts" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const tiles = following.getByRole("listitem");
  await expect(tiles).toHaveCount(2);
  await expect(tiles.first()).toContainText("FixtureCasts");
  await expect(following).toContainText("1 live now");

  const saved = await (await page.request.get("/api/v1/me/streamers")).json();
  expect(
    saved.data.channels.map((c: { platform: string; login: string; status: string }) => [
      c.platform,
      c.login,
      c.status,
    ]),
  ).toEqual([
    ["twitch", "fixturecasts", "live"],
    ["twitch", "fixturelegend", "offline"],
  ]);

  // Saved: still there after a reload, and a live one plays from the row.
  await page.reload();
  await expect(tiles).toHaveCount(2);
  await following.getByRole("button", { name: "Watch FixtureCasts (live)" }).click();
  await expect(page).toHaveURL(/\?watch=fixturecasts$/);
  await expect(page.locator('iframe[title="FixtureCasts on Twitch"]')).toBeVisible();

  // Unfollow both from the row.
  await following.getByRole("button", { name: "Unfollow FixtureCasts" }).click();
  await expect(tiles).toHaveCount(1);
  await following.getByRole("button", { name: "Unfollow FixtureLegend" }).click();
  await expect(following).toContainText("You aren't following any streamers yet");
  const after = await (await page.request.get("/api/v1/me/streamers")).json();
  expect(after.data.channels).toEqual([]);
  // Unfollowing never stopped the player.
  await expect(page.locator('iframe[title="FixtureCasts on Twitch"]')).toBeVisible();
});

test("on a phone the player fits, with chat collapsed until asked for", async ({ page }) => {
  await stubTwitch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/live?watch=fixturecasts");
  const player = page.getByRole("region", { name: "FixtureCasts" });
  await expect(player.locator('iframe[title="FixtureCasts on Twitch"]')).toBeVisible();
  const chat = player.locator('iframe[title="FixtureCasts chat on Twitch"]');
  await expect(chat).toHaveCount(0);
  const toggle = player.getByRole("button", { name: "Show chat" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await clickUntil(
    page,
    () => toggle.click({ timeout: 2_000 }),
    () => expect(chat).toBeVisible({ timeout: 3_000 }),
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the streamer follow API needs a session and a valid channel", async ({ page, request }) => {
  const origin = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
  const guest = await request.post("/api/v1/me/streamers", {
    data: { platform: "twitch", channelId: "9001", login: "fixturecasts", displayName: "X" },
    headers: { origin },
  });
  expect(guest.status()).toBe(401);
  const search = await request.get("/api/v1/live/channels?q=a");
  expect(search.status()).toBe(400);

  await page.goto("/api/v1/auth/steam/login?as=76561197960477002");
  const bad = await page.request.post("/api/v1/me/streamers", {
    data: { platform: "twitch", channelId: "9001", login: "bad login", displayName: "X" },
    headers: { origin },
  });
  expect(bad.status()).toBe(400);
  const cross = await page.request.post("/api/v1/me/streamers", {
    data: { platform: "twitch", channelId: "9001", login: "fixturecasts", displayName: "X" },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);
  // Twitch says there's no such channel.
  const missing = await page.request.post("/api/v1/me/streamers", {
    data: { platform: "twitch", channelId: "123456", login: "ghost", displayName: "Ghost" },
    headers: { origin },
  });
  expect(missing.status()).toBe(404);
});
