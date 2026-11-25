import { expect, test } from "@playwright/test";
import { attemptSteamId } from "./support/attempt";

// Invite a friend (ADR 0013, "Referrals"): a new player signs in through an invite link, their
// games import, and both get a week of Plus inside the app. Own identities per run: the friend
// has 20 fixture games (support/opendota-fixture-server.mjs, INVITED).
const login = (steamId: string, next?: string) =>
  `/api/v1/auth/steam/login?as=${steamId}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

test("a friend signs in through an invite: once their games import, both get a week of Plus", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const origin = new URL(baseURL!).origin;
  const inviter = await (await browser.newContext()).newPage();
  const friend = await (await browser.newContext()).newPage();

  await inviter.goto(login(attemptSteamId("76561197960461301")));
  await inviter.goto("/plus");
  await inviter
    .getByRole("region", { name: "Invite a friend: you both get a week of Plus" })
    .getByRole("link", { name: "Get your invite link" })
    .click();
  await expect(inviter).toHaveURL(/\/invite$/);
  const url = (await inviter.getByTestId("referral-url").textContent())!.trim();
  const path = new URL(url).pathname;
  expect(path).toMatch(/^\/r\/[2-9a-z]{8}$/);
  await expect(inviter.getByText("0 of 5")).toBeVisible();

  // Signed out: what it is, and a Steam sign-in that comes back to the invite.
  await friend.goto(path);
  await expect(
    friend.getByRole("heading", { level: 1, name: "A friend invited you to Dota Den" }),
  ).toBeVisible();
  await expect(friend.getByRole("link", { name: "Sign in with Steam" })).toHaveAttribute(
    "href",
    `/api/v1/auth/steam/login?next=${encodeURIComponent(path)}`,
  );
  const steamId = attemptSteamId("76561197960466003");
  await friend.goto(login(steamId, path));
  await expect(friend).toHaveURL(new RegExp(`${path}$`));

  // Claimed before any games are imported: it waits for them.
  await friend.getByRole("button", { name: "Claim your week of Plus" }).click();
  await expect(friend.getByRole("status")).toContainText("Your week starts once 10 of your games");
  const sync = await friend.request.post("/api/v1/me/matches/sync", { headers: { origin } });
  expect(sync.status()).toBe(200);
  // The dashboard visit gives both weeks (after its response).
  await friend.goto("/dashboard");
  await expect(async () => {
    await friend.goto("/account");
    await expect(friend.getByRole("region", { name: "Your plan" })).toContainText(
      /Invite reward: Plus until .* Nothing is charged/,
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 30_000 });

  await inviter.reload();
  await expect(inviter.getByText("1 of 5")).toBeVisible();
  await inviter.goto("/account");
  await expect(inviter.getByRole("region", { name: "Your plan" })).toContainText(
    /Invite reward: Plus until/,
  );

  // Your own link can't be claimed, and a cross-site claim never runs.
  await inviter.goto(path);
  await expect(inviter.getByText("This is your own invite link")).toBeVisible();
  await expect(inviter.getByRole("button", { name: "Claim your week of Plus" })).toHaveCount(0);
  const code = path.slice(3);
  const forged = await friend.request.post("/api/v1/plus/referrals/claim", {
    data: { code },
    headers: { origin: "https://evil.test" },
  });
  expect(forged.status()).toBe(403);
  // Claiming again is a no-op.
  const again = await friend.request.post("/api/v1/plus/referrals/claim", {
    data: { code },
    headers: { origin },
  });
  expect((await again.json()).data).toEqual({ status: "rewarded" });
});

test("an unknown invite link says so", async ({ page }) => {
  await page.goto("/r/zzzzzzzz");
  await expect(page.getByText("This invite link doesn't work")).toBeVisible();
});
