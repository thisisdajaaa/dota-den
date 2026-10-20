import { expect, test, type Locator, type Page } from "@playwright/test";

// A second synthetic identity (the fixture's "Fixture Peer", account 40001).
const GUEST_STEAM_ID = "76561197960305729";

/** Another player's page sees a change on its next poll (every second, slower on CI). */
const SYNCED = { timeout: 30_000 };

/**
 * Clicks until the click has an effect. On a slow machine a button can be clicked before
 * the page's JavaScript is attached; the click is then lost, so try again.
 */
async function clickUntil(button: Locator, effect: () => Promise<void>) {
  await expect(async () => {
    await button.click();
    await effect();
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
}

async function banFirstAvailable(page: Page, nextStep: string) {
  const grid = page.getByRole("region", { name: "Heroes" });
  await clickUntil(grid.getByRole("button", { name: /^ban / }).first(), () =>
    expect(page.getByText(nextStep, { exact: true })).toBeVisible({ timeout: 5000 }),
  );
}

test("two captains draft live in a room while a spectator watches", async ({ browser }) => {
  // Three people on a live, polling page: longer than one page's worth of steps on CI.
  test.setTimeout(120_000);
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();

  await hostPage.goto("/api/v1/auth/steam/login");
  await guestPage.goto(`/api/v1/auth/steam/login?as=${GUEST_STEAM_ID}`);

  // The host opens a room from the draft page.
  await hostPage.goto("/draft");
  await hostPage.getByRole("link", { name: "Draft with a friend" }).click();
  await expect(
    hostPage.getByRole("heading", { level: 1, name: "Draft against a friend" }),
  ).toBeVisible();
  await hostPage.getByRole("button", { name: "Create room" }).click();
  await expect(hostPage).toHaveURL(/\/draft\/rooms\/[A-Za-z0-9]{10}$/);
  const roomUrl = hostPage.url();

  const hostLobby = hostPage.getByRole("region", { name: "Lobby" });
  await expect(hostLobby).toContainText("Fixture Hero");
  await expect(hostLobby.getByRole("button", { name: "Start draft" })).toBeDisabled();

  // The guest joins through the link and takes the open seat.
  await guestPage.goto(roomUrl);
  const guestLobby = guestPage.getByRole("region", { name: "Lobby" });
  await clickUntil(guestLobby.getByRole("button", { name: "Take seat" }), () =>
    expect(guestLobby).toContainText("Waiting for the host to start", { timeout: 5000 }),
  );

  // The host sees the guest arrive (polling) and starts.
  await expect(hostLobby).toContainText("Fixture Peer", SYNCED);
  await clickUntil(hostLobby.getByRole("button", { name: "Start draft" }), () =>
    expect(hostPage.getByText("Step 1 of 24", { exact: true })).toBeVisible({ timeout: 5000 }),
  );

  // Radiant (host) has first pick, so the host bans first; the guest can't act yet.
  await expect(hostPage.getByText("Step 1 of 24", { exact: true })).toBeVisible();
  await expect(guestPage.getByText("Step 1 of 24", { exact: true })).toBeVisible(SYNCED);
  await expect(
    guestPage
      .getByRole("region", { name: "Heroes" })
      .getByRole("button", { name: /^ban / })
      .first(),
  ).toBeDisabled();

  await banFirstAvailable(hostPage, "Step 2 of 24");
  await expect(guestPage.getByText("Step 2 of 24", { exact: true })).toBeVisible(SYNCED);

  // A spectator (signed out) can watch but not draft.
  const spectator = await browser.newContext();
  const watchPage = await spectator.newPage();
  await watchPage.goto(roomUrl);
  await expect(watchPage.getByText(/You're watching this draft/)).toBeVisible();
  await expect(watchPage.getByText("Step 2 of 24", { exact: true })).toBeVisible(SYNCED);

  await host.close();
  await guest.close();
  await spectator.close();
});

test("room links that don't exist show a friendly page", async ({ page }) => {
  await page.goto("/draft/rooms/ZZZZZZZZZZ");
  await expect(page.getByRole("heading", { name: "Draft room not found" })).toBeVisible();
  await page.goto("/draft/rooms/bad");
  await expect(page.getByRole("heading", { name: "Draft room not found" })).toBeVisible();
});

test("room APIs reject cross-origin and signed-out writes", async ({ request }) => {
  const create = await request.post("/api/v1/drafts/rooms", {
    headers: { origin: "https://evil.example" },
    data: { rulesetId: "cm-2026", firstSide: "radiant", hostSide: "radiant", timerEnabled: false },
  });
  expect(create.status()).toBe(403);
  const poll = await request.get("/api/v1/drafts/rooms/ZZZZZZZZZZ");
  expect(poll.status()).toBe(404);
});
