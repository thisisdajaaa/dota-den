import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

// Identities no other spec uses (one per role, so parallel runs don't collide).
const OWNER = "76561197960462001";
const FRIEND = "76561197960462002";
const OUTSIDER = "76561197960462003";
const API_USER = "76561197960462004";
const accountOf = (steamId: string) => Number(BigInt(steamId) - 76561197960265728n);
const nameOf = (steamId: string) => `Player ${accountOf(steamId)}`;

async function signedIn(browser: Browser, steamId?: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/api/v1/auth/steam/login${steamId ? `?as=${steamId}` : ""}`);
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

test("create a group, a friend joins by link, outsiders get a 404, then remove and leave", async ({
  browser,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  const owner = await signedIn(browser, OWNER);
  await owner.goto("/groups");
  await expect(owner.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();
  await owner.getByLabel("Group name").fill("Friday stack");
  await owner.getByRole("button", { name: "Create group" }).click();
  await expect(owner).toHaveURL(/\/groups\/[a-f0-9]{24}$/);
  const groupPath = new URL(owner.url()).pathname;
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText("Friday stack");
  const inviteUrl = (await owner.getByTestId("invite-url").textContent())!.trim();
  expect(inviteUrl).toMatch(/\/groups\/join\/[A-Za-z0-9]{24}$/);

  // The friend opens the link while signed in and joins.
  const friend = await signedIn(browser, FRIEND);
  await friend.goto(inviteUrl);
  await expect(friend.getByRole("heading", { name: "Join Friday stack" })).toBeVisible();
  await expect(friend.getByText(/Never your MMR/).first()).toBeVisible();
  await friend.getByRole("button", { name: "Join group" }).click();
  await expect(friend).toHaveURL(new RegExp(`${groupPath}$`));
  const members = friend.getByRole("region", { name: "Members" });
  await expect(members.getByText(nameOf(OWNER))).toBeVisible();
  await expect(members.getByText(nameOf(FRIEND))).toBeVisible();
  await expect(friend.getByRole("region", { name: "Record as a party" })).toBeVisible();
  await expect(friend.getByRole("region", { name: "Weekly group board" })).toBeVisible();
  // Members can't manage the group.
  await expect(friend.getByRole("button", { name: "Delete group" })).toHaveCount(0);
  await owner.reload();
  await expect(
    owner.getByRole("region", { name: "Members" }).getByText(nameOf(FRIEND)),
  ).toBeVisible();

  // Someone else signed in: the page and the API act as if it didn't exist.
  const outsider = await signedIn(browser, OUTSIDER);
  const res = await outsider.goto(groupPath);
  expect(res?.status()).toBe(404);
  await expect(outsider.getByRole("heading", { name: "Group not found" })).toBeVisible();
  const groupId = groupPath.split("/").pop();
  expect(
    (await outsider.request.post(`/api/v1/groups/${groupId}/leave`, { headers })).status(),
  ).toBe(404);
  expect((await friend.request.delete(`/api/v1/groups/${groupId}`, { headers })).status()).toBe(
    403,
  );

  // The owner removes the friend; the page is gone for them.
  await owner.getByRole("button", { name: `Remove ${nameOf(FRIEND)} from the group` }).click();
  await owner.getByRole("button", { name: `Remove ${nameOf(FRIEND)}?` }).click();
  await expect(
    owner.getByRole("region", { name: "Members" }).getByText(nameOf(FRIEND)),
  ).toHaveCount(0);
  expect((await friend.goto(groupPath))?.status()).toBe(404);

  // They rejoin by the same link, then leave on their own.
  await friend.goto(inviteUrl);
  await friend.getByRole("button", { name: "Join group" }).click();
  await expect(friend).toHaveURL(new RegExp(`${groupPath}$`));
  await friend.getByRole("button", { name: "Leave group" }).click();
  await friend.getByRole("button", { name: "Yes, leave" }).click();
  await expect(friend).toHaveURL(/\/groups$/);
  await expect(friend.getByText("You're not in a group yet.", { exact: false })).toBeVisible();

  // Resetting the link stops the old one.
  await owner.getByRole("button", { name: "Reset link" }).click();
  await expect(owner.getByTestId("invite-url")).not.toHaveText(inviteUrl);
  await friend.goto(inviteUrl);
  await expect(
    friend.getByRole("heading", { name: "This invite link doesn't work" }),
  ).toBeVisible();

  // Rename, then delete.
  await owner.getByRole("button", { name: "Rename" }).click();
  await owner.getByLabel("New name").fill("Saturday stack");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText("Saturday stack");
  await owner.getByRole("button", { name: "Delete group" }).click();
  await owner.getByRole("button", { name: "Yes, delete it for everyone" }).click();
  await expect(owner).toHaveURL(/\/groups$/);
  expect((await owner.goto(groupPath))?.status()).toBe(404);

  for (const p of [owner, friend, outsider]) await p.context().close();
});

test("the group page counts confirmed party games only, and unknown party data as unknown", async ({
  browser,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  // Fixture Hero and Fixture Peer share 4 party games, 1 same-team game without party data
  // and 1 game as opponents.
  const hero = await signedIn(browser);
  const made = await hero.request.post("/api/v1/groups", {
    data: { name: "Fixture stack" },
    headers,
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()).data;
  await hero.goto(`/groups/${id}`);
  const invite = (await hero.getByTestId("invite-url").textContent())!.trim();
  const token = invite.split("/").pop();

  const peer = await signedIn(browser, "76561197960305729");
  const joined = await peer.request.post("/api/v1/groups/join", { data: { token }, headers });
  expect(joined.status()).toBe(200);

  await hero.goto(`/groups/${id}`);
  const record = hero.getByRole("region", { name: "Record as a party" });
  await expect(record.getByText("Party games", { exact: true })).toBeVisible();
  await expect(record).toContainText("1 game with members on one team but no party data");
  const perMember = hero.getByRole("region", { name: "Party games per member" });
  await expect(perMember).toContainText("Fixture Peer");
  await expect(perMember).toContainText("4 party games");
  await expect(hero.getByRole("region", { name: "Members" })).toContainText("Fixture Hero");

  // Linked from Together.
  await hero.goto("/together");
  await hero
    .getByRole("region", { name: "Your groups" })
    .getByRole("link", { name: "Open Fixture stack" })
    .click();
  await expect(hero).toHaveURL(new RegExp(`/groups/${id}$`));
  // Metadata streams in after a client-side navigation: wait for it before the axe pass.
  await expect(hero).toHaveTitle(/Fixture stack/);

  const axe = await new AxeBuilder({ page: hero }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);

  // Clean up so reruns against the same database start fresh.
  expect((await hero.request.delete(`/api/v1/groups/${id}`, { headers })).status()).toBe(200);
  for (const p of [hero, peer]) await p.context().close();
});

test("group APIs need you signed in, the same origin and valid input", async ({
  request,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  expect((await request.post("/api/v1/groups", { data: { name: "x y" } })).status()).toBe(403);
  expect(
    (await request.post("/api/v1/groups", { data: { name: "Stack" }, headers })).status(),
  ).toBe(401);
  await request.get(`/api/v1/auth/steam/login?as=${API_USER}`);
  expect((await request.post("/api/v1/groups", { data: { name: " " }, headers })).status()).toBe(
    400,
  );
  expect(
    (await request.post("/api/v1/groups/join", { data: { token: "short" }, headers })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/v1/groups/join", { data: { token: "A".repeat(24) }, headers })
    ).status(),
  ).toBe(404);
  expect((await request.post("/api/v1/groups/not-an-id/leave", { headers })).status()).toBe(400);
});
