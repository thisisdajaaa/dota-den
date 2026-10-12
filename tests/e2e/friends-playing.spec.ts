import { expect, test } from "@playwright/test";

// Each test signs in as its own identity; the fixture's fake Steam Web API knows them.
const PLAYING = "/api/v1/auth/steam/login?as=76561197960458881";
const NOBODY = "/api/v1/auth/steam/login?as=76561197960458882";
// Not in the fixture's friend lists: Steam answers 401 (private friend list).
const PRIVATE_LIST = "/api/v1/auth/steam/login?as=76561197960458883";
const API = "/api/v1/me/friends/playing";

test("shows friends in Dota 2, linking to their live game or profile", async ({ page }) => {
  await page.goto(PLAYING);
  await expect(page).toHaveURL(/\/dashboard$/);

  const strip = page.getByRole("region", { name: "Friends playing now" });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("3 friends in Dota 2");
  await expect(strip.getByRole("listitem")).toHaveCount(3);
  // In OpenDota's live feed: links to the live game.
  await expect(
    strip.getByRole("link", { name: "Fixture Pro: In a match. Watch live" }),
  ).toHaveAttribute("href", "/live/8000000001");
  // Steam reports a game server: in a match, but no live game to link to.
  await expect(
    strip.getByRole("link", { name: "Fixture Stacker: In a match. View profile" }),
  ).toHaveAttribute("href", "/players/60002");
  // Only "in Dota 2": no claim about a match.
  await expect(
    strip.getByRole("link", { name: "Fixture Friend: Playing Dota 2. View profile" }),
  ).toHaveAttribute("href", "/players/60001");
  await expect(strip).toContainText("From your Steam friends list.");
  // Private profiles, other games and offline friends never show.
  await expect(strip).not.toContainText("Fixture Private");
  await expect(strip).not.toContainText("Fixture Other Game");
  await expect(strip).not.toContainText("Fixture Offline");

  // The endpoint the strip polls.
  const res = await page.request.get(API);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  const body = await res.json();
  expect(body).toMatchObject({ success: true, data: { enabled: true, source: "steam_friends" } });
  expect(body.data.friends.map((f: { accountId32: number }) => f.accountId32)).toEqual([
    50000, 60002, 60001,
  ]);

  await strip.getByRole("link", { name: /Fixture Pro/ }).click();
  await expect(page).toHaveURL(/\/live\/8000000001$/);
});

test("hides the strip when no friend is in Dota 2", async ({ page }) => {
  await page.goto(NOBODY);
  await expect(page).toHaveURL(/\/dashboard$/);
  const res = await page.request.get(API);
  expect(await res.json()).toMatchObject({
    success: true,
    data: { enabled: true, source: "steam_friends", friends: [] },
  });
  // The rest of the overview has streamed in, and no strip with it.
  await expect(page.getByRole("region", { name: "Player" })).toBeVisible();
  await expect(page.getByText("Who you play with").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Friends playing now" })).toHaveCount(0);
});

test("falls back to tracked players when the Steam friend list is private", async ({
  page,
  baseURL,
}) => {
  await page.goto(PRIVATE_LIST);
  await expect(page).toHaveURL(/\/dashboard$/);
  const follow = await page.request.post("/api/v1/me/follows", {
    data: { accountId32: 60_001 },
    headers: { origin: new URL(baseURL!).origin },
  });
  expect(follow.status()).toBe(201);

  await page.reload();
  const strip = page.getByRole("region", { name: "Friends playing now" });
  await expect(
    strip.getByRole("link", { name: "Fixture Friend: Playing Dota 2. View profile" }),
  ).toBeVisible();
  await expect(strip.getByRole("listitem")).toHaveCount(1);
  await expect(strip).toContainText("Your Steam friends list is private");
});

test("the friends-playing endpoint needs a session", async ({ request }) => {
  const res = await request.get(API);
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ success: false, data: null });
});
