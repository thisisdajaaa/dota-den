import { expect, test, type Page } from "@playwright/test";

// A second synthetic identity (the fixture's "Fixture Peer", account 40001).
const GUEST_STEAM_ID = "76561197960305729";

async function banFirstAvailable(page: Page) {
  const grid = page.getByRole("region", { name: "Heroes" });
  await grid.getByRole("button", { name: /^ban / }).first().click();
}

test("two captains draft live in a room while a spectator watches", async ({ browser }) => {
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
  await guestLobby.getByRole("button", { name: "Take seat" }).click();
  await expect(guestLobby).toContainText("Waiting for the host to start");

  // The host sees the guest arrive (polling) and starts.
  await expect(hostLobby).toContainText("Fixture Peer");
  await hostLobby.getByRole("button", { name: "Start draft" }).click();

  // Radiant (host) has first pick, so the host bans first; the guest can't act yet.
  await expect(hostPage.getByText("Step 1 of 24", { exact: true })).toBeVisible();
  await expect(guestPage.getByText("Step 1 of 24", { exact: true })).toBeVisible();
  await expect(
    guestPage
      .getByRole("region", { name: "Heroes" })
      .getByRole("button", { name: /^ban / })
      .first(),
  ).toBeDisabled();

  await banFirstAvailable(hostPage);
  await expect(guestPage.getByText("Step 2 of 24", { exact: true })).toBeVisible();

  // A spectator (signed out) can watch but not draft.
  const spectator = await browser.newContext();
  const watchPage = await spectator.newPage();
  await watchPage.goto(roomUrl);
  await expect(watchPage.getByText(/You're watching this draft/)).toBeVisible();
  await expect(watchPage.getByText("Step 2 of 24", { exact: true })).toBeVisible();

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
