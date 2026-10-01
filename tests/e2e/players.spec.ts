import { expect, test } from "@playwright/test";

test("guests search by name, open a profile and see who they play with", async ({ page }) => {
  await page.goto("/players");
  await expect(page.getByRole("heading", { level: 1, name: "Players" })).toBeVisible();
  // Guests get no tracked list.
  await expect(page.getByRole("region", { name: "Tracked players" })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Find a player" }).fill("Fixture Hero");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/players\?q=Fixture\+Hero$/);

  const results = page.getByRole("region", { name: /Players named/ });
  await expect(results).toContainText("1 player found");
  await results.getByRole("link", { name: /Fixture Hero/ }).click();

  await expect(page).toHaveURL(/\/players\/22202$/);
  const banner = page.getByRole("region", { name: "Player" });
  await expect(banner.getByRole("heading", { level: 1, name: "Fixture Hero" })).toBeVisible();
  await expect(banner.getByText("Immortal #1,234", { exact: true })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Sign in to track" })).toBeVisible();

  const record = page.getByRole("region", { name: "Record" });
  await expect(record).toContainText("58.3%");
  await expect(record).toContainText("7 wins · 5 losses");

  const playsWith = page.getByRole("region", { name: "Plays with" });
  await expect(playsWith.getByRole("link", { name: "Fixture Peer" })).toBeVisible();
  await expect(playsWith).toContainText("54 games together · 51.9% win rate together");
  await expect(playsWith.getByRole("link", { name: "Fixture Duo" })).toBeVisible();
  // Opponents only are not teammates.
  await expect(playsWith).not.toContainText("Fixture Rival");

  const heroes = page.getByRole("region", { name: "Most played heroes" });
  await expect(heroes).toContainText("Anti-Mage");
  await expect(heroes).toContainText("8 games · 62.5% win rate");

  const recent = page.getByRole("region", { name: "Recent matches" });
  await expect(recent.locator('a[href^="/matches/"]')).toHaveCount(12);
  await expect(page.getByRole("link", { name: "OpenDota" })).toHaveAttribute(
    "href",
    "https://www.opendota.com/players/22202",
  );

  // Teammates link to their own profiles.
  await playsWith.getByRole("link", { name: "Fixture Peer" }).click();
  await expect(page).toHaveURL(/\/players\/40001$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Peer" })).toBeVisible();
});

test("ids and profile links go straight to the profile", async ({ page }) => {
  await page.goto("/players?q=22202");
  await expect(page).toHaveURL(/\/players\/22202$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fixture Hero" })).toBeVisible();

  await page.goto(
    `/players?q=${encodeURIComponent("https://steamcommunity.com/profiles/76561197960287930/")}`,
  );
  await expect(page).toHaveURL(/\/players\/22202$/);
});

test("search explains short queries, empty results and custom Steam links", async ({ page }) => {
  await page.goto("/players?q=a");
  await expect(page.getByText("Type at least 2 characters")).toBeVisible();

  await page.goto("/players?q=nobody-by-this-name");
  await expect(
    page.getByRole("heading", { name: "No players found for “nobody-by-this-name”" }),
  ).toBeVisible();

  await page.goto(`/players?q=${encodeURIComponent("https://steamcommunity.com/id/Fixture Peer")}`);
  await expect(
    page.getByText("Steam custom profile links can't be looked up directly"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: /Players named/ })).toContainText("Fixture Peer");
});

test("unknown and malformed player ids show not found", async ({ page }) => {
  for (const id of ["0", "abc", "4294967296", "12345"]) {
    await page.goto(`/players/${id}`);
    await expect(page.getByRole("heading", { name: "Player not found" })).toBeVisible();
  }
});

test("signed-in users track and untrack players", async ({ page }) => {
  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/players");
  const tracked = page.getByRole("region", { name: "Tracked players" });
  await expect(tracked).toContainText("You aren't tracking anyone yet");

  // Your own profile points to the dashboard instead of offering to track yourself.
  await page.goto("/players/22202");
  await expect(page.getByRole("link", { name: /open your dashboard/ })).toHaveAttribute(
    "href",
    "/dashboard",
  );
  await expect(page.getByRole("button", { name: /Track/ })).toHaveCount(0);

  await page.goto("/players/40001");
  const track = page.getByRole("button", { name: "Track Fixture Peer" });
  const tracking = page.getByRole("button", { name: "Stop tracking Fixture Peer" });
  // Retry until hydrated: a click before hydration does nothing.
  await expect(async () => {
    if ((await tracking.count()) === 0) await track.click({ timeout: 2_000 });
    await expect(tracking).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(tracking).toHaveAttribute("aria-pressed", "true");

  const saved = await page.request.get("/api/v1/me/follows");
  expect((await saved.json()).follows.map((f: { accountId32: number }) => f.accountId32)).toEqual([
    40001,
  ]);

  await page.goto("/players");
  await expect(tracked.getByRole("link", { name: /Fixture Peer/ })).toHaveAttribute(
    "href",
    "/players/40001",
  );
  await expect(tracked).toContainText("Legend 4");

  const untrack = tracked.getByRole("button", { name: "Stop tracking Fixture Peer" });
  await expect(async () => {
    if ((await untrack.count()) > 0) await untrack.click({ timeout: 2_000 });
    await expect(tracked).toContainText("You aren't tracking anyone yet", { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const after = await page.request.get("/api/v1/me/follows");
  expect((await after.json()).follows).toEqual([]);
});

test("follow API rejects cross-origin, guests and bad input", async ({ page, request }) => {
  const origin = `http://localhost:${process.env.E2E_PORT ?? 3100}`;
  const guest = await request.post("/api/v1/me/follows", {
    data: { accountId32: 40001 },
    headers: { origin },
  });
  expect(guest.status()).toBe(401);

  await page.goto("/api/v1/auth/steam/login");
  await expect(page).toHaveURL(/\/dashboard$/);

  const cross = await page.request.post("/api/v1/me/follows", {
    data: { accountId32: 40001 },
    headers: { origin: "https://evil.example" },
  });
  expect(cross.status()).toBe(403);

  const bad = await page.request.post("/api/v1/me/follows", {
    data: { accountId32: "40001" },
    headers: { origin },
  });
  expect(bad.status()).toBe(400);

  const self = await page.request.post("/api/v1/me/follows", {
    data: { accountId32: 22202 },
    headers: { origin },
  });
  expect(self.status()).toBe(400);

  const badDelete = await page.request.delete("/api/v1/me/follows/not-a-number", {
    headers: { origin },
  });
  expect(badDelete.status()).toBe(400);
});
