import { expect, test, type Locator, type Page } from "@playwright/test";

// A second synthetic identity (the fixture's "Fixture Peer", account 40001).
const GUEST_STEAM_ID = "76561197960305729";

/** Another player's page sees a change on its next poll (every second, slower on CI). */
const SYNCED = { timeout: 30_000 };

/**
 * Clicks until the page sends its POST to `action` (a click before the page's JavaScript is
 * attached sends nothing; then click again), then waits for the effect. Never clicks again
 * once the request is out: a slow answer to a ban is no reason to ban again, and in Captain's
 * Mode the next turn is often the same side's, so a second click would be a second ban.
 */
async function clickUntilSent(
  page: Page,
  button: Locator,
  action: string,
  effect: () => Promise<void>,
) {
  await expect(async () => {
    const sent = page
      .waitForRequest(
        (r) => r.method() === "POST" && new URL(r.url()).pathname.endsWith(`/${action}`),
        { timeout: 2_000 },
      )
      .then(
        () => true,
        () => false,
      );
    await button.click();
    expect(await sent).toBe(true);
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  await effect();
}

async function banFirstAvailable(page: Page, nextStep: string) {
  const grid = page.getByRole("region", { name: "Heroes" });
  await clickUntilSent(page, grid.getByRole("button", { name: /^ban / }).first(), "actions", () =>
    expect(page.getByText(nextStep, { exact: true })).toBeVisible(SYNCED),
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
  await clickUntilSent(
    guestPage,
    guestLobby.getByRole("button", { name: "Take seat" }),
    "join",
    () => expect(guestLobby).toContainText("Waiting for the host to start", SYNCED),
  );

  // The host sees the guest arrive (polling) and starts.
  await expect(hostLobby).toContainText("Fixture Peer", SYNCED);
  await clickUntilSent(
    hostPage,
    hostLobby.getByRole("button", { name: "Start draft" }),
    "start",
    () => expect(hostPage.getByText("Step 1 of 24", { exact: true })).toBeVisible(SYNCED),
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
