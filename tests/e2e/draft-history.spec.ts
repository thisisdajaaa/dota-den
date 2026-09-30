import { expect, test, type Page } from "@playwright/test";

// A second synthetic identity (the fixture's "Fixture Peer", account 40001).
const GUEST_STEAM_ID = "76561197960305729";

async function chooseFirstAvailable(page: Page, action: "ban" | "pick") {
  const button = page
    .getByRole("region", { name: "Heroes" })
    .getByRole("button", { name: new RegExp(`^${action} `) })
    .first();
  await expect(button).toBeEnabled();
  await button.click();
}

test("finished room drafts are saved to both captains' history with a reported result", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  await hostPage.goto("/api/v1/auth/steam/login");
  await guestPage.goto(`/api/v1/auth/steam/login?as=${GUEST_STEAM_ID}`);

  // The draft page links to the history.
  await hostPage.goto("/draft");
  await expect(hostPage.getByRole("link", { name: "Your draft history" })).toBeVisible();

  // A short practice draft without the timer: host is Radiant with first pick.
  await hostPage.goto("/draft/rooms/new");
  await expect(hostPage.getByRole("link", { name: "Your draft history" })).toBeVisible();
  await hostPage.getByRole("combobox", { name: "Draft mode" }).click();
  await hostPage.getByRole("option", { name: "Simple practice" }).click();
  await hostPage.getByRole("checkbox", { name: /Captain's Mode timer/ }).uncheck();
  await hostPage.getByRole("button", { name: "Create room" }).click();
  await expect(hostPage).toHaveURL(/\/draft\/rooms\/[A-Za-z0-9]{10}$/);
  const roomUrl = hostPage.url();

  await guestPage.goto(roomUrl);
  await guestPage
    .getByRole("region", { name: "Lobby" })
    .getByRole("button", { name: "Take seat" })
    .click();
  const hostLobby = hostPage.getByRole("region", { name: "Lobby" });
  await expect(hostLobby).toContainText("Fixture Peer");
  await hostLobby.getByRole("button", { name: "Start draft" }).click();

  // Simple practice: 8 alternating bans, then 10 alternating picks, Radiant (host) first.
  for (let step = 0; step < 18; step++) {
    const page = step % 2 === 0 ? hostPage : guestPage;
    await expect(page.getByText(`Step ${step + 1} of 18`, { exact: true })).toBeVisible();
    await chooseFirstAvailable(page, step < 8 ? "ban" : "pick");
  }
  await expect(hostPage.getByText("Both lineups are locked in")).toBeVisible();
  await expect(guestPage.getByText("Both lineups are locked in")).toBeVisible();

  // The guest reports the real game's result; the host sees it (self-reported).
  const guestResult = guestPage.getByRole("region", { name: "Game result" });
  await expect(guestResult).toContainText("Self-reported");
  await expect(guestResult).toContainText("No result reported yet.");
  await guestResult.getByRole("button", { name: "Radiant won" }).click();
  await expect(guestResult.getByRole("status")).toContainText("reported by Fixture Peer");

  const hostResult = hostPage.getByRole("region", { name: "Game result" });
  await expect(hostResult.getByRole("status")).toContainText("Radiant won");
  await expect(hostResult.getByRole("status")).toContainText("reported by Fixture Peer");
  await expect(hostResult.getByRole("button", { name: "Radiant won" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Both captains see the draft in their history, with the head-to-head for that friend.
  await hostResult.getByRole("link", { name: "Your drafts with Fixture Peer" }).click();
  await expect(hostPage).toHaveURL(/\/draft\/rooms\/history\?friend=40001$/);
  const h2h = hostPage.getByRole("region", { name: "Head to head" });
  await expect(h2h).toContainText("You vs Fixture Peer");
  await expect(h2h).toContainText("Drafts together");
  await expect(h2h).toContainText(/1\s*–\s*0/);
  await expect(h2h).toContainText("self-reported");
  const hostRow = hostPage
    .getByRole("region", { name: "Recorded drafts" })
    .getByRole("listitem", { name: "Draft against Fixture Peer" })
    .first();
  await expect(hostRow).toContainText("You won");
  await expect(hostRow.getByRole("link", { name: "View draft" })).toHaveAttribute(
    "href",
    /\/draft\?snapshot=/,
  );
  await expect(hostRow.getByRole("link", { name: "Open room" })).toBeVisible();

  await guestPage.goto("/draft/rooms/history");
  const guestRow = guestPage
    .getByRole("region", { name: "Recorded drafts" })
    .getByRole("listitem", { name: "Draft against Fixture Hero" })
    .first();
  await expect(guestRow).toContainText("You lost");
  await expect(guestRow).toContainText("self-reported by you");
  await guestPage
    .getByRole("navigation", { name: "Filter by friend" })
    .getByRole("link", {
      name: /Fixture Hero/,
    })
    .click();
  await expect(guestPage.getByRole("region", { name: "Head to head" })).toContainText(/0\s*–\s*1/);

  // The read-only view replays the saved draft.
  await guestRow.getByRole("link", { name: "View draft" }).click();
  await expect(guestPage.getByRole("heading", { level: 1, name: "Shared draft" })).toBeVisible();

  await host.close();
  await guest.close();
});

test("the result API rejects cross-origin, signed-out and bad writes", async ({ request }) => {
  const cross = await request.post("/api/v1/drafts/rooms/ZZZZZZZZZZ/result", {
    headers: { origin: "https://evil.example" },
    data: { winner: "radiant" },
  });
  expect(cross.status()).toBe(403);
  const signedOut = await request.post("/api/v1/drafts/rooms/ZZZZZZZZZZ/result", {
    data: { winner: "radiant" },
  });
  expect([401, 403]).toContain(signedOut.status());
  const missing = await request.get("/api/v1/drafts/rooms/ZZZZZZZZZZ/result");
  expect(missing.status()).toBe(404);
});

test("the history page asks signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/draft/rooms/history");
  await expect(page.getByRole("heading", { level: 1, name: "Your draft history" })).toBeVisible();
  await expect(
    page.locator("#main").getByRole("link", { name: "Sign in through Steam" }),
  ).toBeVisible();
});
