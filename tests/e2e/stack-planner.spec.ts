import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { grantPlus as grant } from "./support/grant-plus";

const grantPlus = (page: Page) => grant(page, "e2e-planner");

// Identities only this spec uses (the fixture server's stack planner data).
const LEAD = "76561197960467201";
const SUPPORT = "76561197960467202";
const MID = "76561197960467203";
const UNPARSED = "76561197960467204";
const OUTSIDER = "76561197960467205";
const accountOf = (steamId: string) => Number(BigInt(steamId) - 76561197960265728n);

// The fixture plays Discord: its host is allowed in test mode only.
const FIXTURE = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 3101}`;
const HOOK_ID = "100000000000000071";
const HOOK = `${FIXTURE}/api/webhooks/${HOOK_ID}/e2eToken_${"p".repeat(60)}`;

async function signedIn(browser: Browser, steamId: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/api/v1/auth/steam/login?as=${steamId}`);
  await expect(page).toHaveURL(/\/dashboard/);
  return page;
}

test("the stack planner suggests positions from real games, with Plus extras", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const headers = { origin: new URL(baseURL!).origin };
  const lead = await signedIn(browser, LEAD);
  const made = await lead.request.post("/api/v1/groups", {
    data: { name: "Barkada stack" },
    headers,
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()).data;
  await lead.goto(`/groups/${id}`);
  const token = (await lead.getByTestId("invite-url").textContent())!.trim().split("/").pop();
  const others = await Promise.all([SUPPORT, MID, UNPARSED].map((s) => signedIn(browser, s)));
  for (const p of others) {
    const joined = await p.request.post("/api/v1/groups/join", { data: { token }, headers });
    expect(joined.status()).toBe(200);
  }

  // The party section checks two member pairs per visit: visit until every pair is checked.
  const record = lead.getByRole("region", { name: "Record as a party" });
  await expect(async () => {
    await lead.reload();
    await expect(record).toContainText("1 game with members on one team but no party data", {
      timeout: 5_000,
    });
    await expect(record.getByText(/Still checking/)).toHaveCount(0, { timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000] });

  // Free player (Support): lineup, positions and evidence; heroes are Plus.
  const support = others[0];
  await support.goto(`/groups/${id}`);
  const planner = support.getByRole("region", { name: "Tonight's best lineup" });
  await expect(planner).toBeVisible();
  // A group of four: everyone is ticked to start (nobody seen in Dota).
  const boxes = planner.getByRole("checkbox");
  await expect(boxes).toHaveCount(4);
  for (const box of await boxes.all()) await expect(box).toBeChecked();
  await expect(async () => {
    await planner.getByRole("button", { name: "Suggest lineup" }).click();
    await expect(planner.getByTestId("planner-slot")).toHaveCount(4, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  const slots = planner.getByTestId("planner-slot");
  const slotOf = (steamId: string) => slots.filter({ hasText: `Player ${accountOf(steamId)}` });
  await expect(slotOf(LEAD)).toContainText("Pos 1");
  await expect(slotOf(LEAD)).toContainText("10–3 on Pos 1 in the last 30 days");
  await expect(slotOf(LEAD)).toContainText("with this stack on Pos 1: 5–1");
  await expect(slotOf(LEAD)).toContainText("together with you: 5–1");
  await expect(slotOf(SUPPORT)).toContainText("Pos 4");
  await expect(slotOf(SUPPORT)).toContainText("10–3 on Pos 4");
  await expect(slotOf(MID)).toContainText("Pos 2");
  await expect(slotOf(MID)).toContainText("9–3 on Pos 2");
  // Never parsed: said out loud, never guessed.
  await expect(slotOf(UNPARSED)).toContainText("No position data");
  const notes = planner.getByTestId("planner-notes");
  await expect(notes).toContainText("Together in the last 30 days: 5–1 in confirmed party games.");
  await expect(notes).toContainText("1 game with you on one team but no party data");
  await expect(notes).toContainText("Thin data");
  await expect(planner).toContainText("Hero picks for each position");
  await expect(planner.getByRole("button", { name: /Post to/ })).toHaveCount(0);
  await expect(planner).not.toContainText(/win probability|chance to win/i);
  await planner.getByText("Text for the group chat").click();
  await expect(planner.getByTestId("planner-text")).toContainText(
    "Tonight's lineup: Barkada stack",
  );

  // Ticking only three: the unparsed member is left out.
  await planner.getByRole("checkbox", { name: `Player ${accountOf(UNPARSED)}` }).uncheck();
  await planner.getByRole("button", { name: "Suggest lineup" }).click();
  await expect(slots).toHaveCount(3);
  await expect(notes).toContainText("This exact stack");
  await expect(notes).not.toContainText("Thin data");

  // Only 2 to 5, and only members: the API answers like the group doesn't exist otherwise.
  const ids = [LEAD, SUPPORT, MID].map(accountOf);
  expect(
    (await support.request.get(`/api/v1/groups/${id}/planner?members=${ids[0]}`)).status(),
  ).toBe(400);
  expect(
    (await support.request.get(`/api/v1/groups/${id}/planner?members=${ids[0]},999`)).status(),
  ).toBe(404);
  const outsider = await signedIn(browser, OUTSIDER);
  expect(
    (await outsider.request.get(`/api/v1/groups/${id}/planner?members=${ids.join(",")}`)).status(),
  ).toBe(404);
  // Discord posting is Plus.
  expect(
    (
      await support.request.post(`/api/v1/groups/${id}/planner/discord`, {
        data: { members: ids },
        headers,
      })
    ).status(),
  ).toBe(403);

  const axe = await new AxeBuilder({ page: support }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);

  // Plus (Lead) with a Discord webhook: hero options, and the plan posts to the channel.
  await grantPlus(lead);
  const saved = await lead.request.put("/api/v1/me/discord/webhook", {
    data: { url: HOOK },
    headers,
  });
  expect(saved.status()).toBe(200);
  await lead.goto(`/groups/${id}`);
  const plusPlanner = lead.getByRole("region", { name: "Tonight's best lineup" });
  await plusPlanner.getByRole("checkbox", { name: `Player ${accountOf(UNPARSED)}` }).uncheck();
  await expect(async () => {
    await plusPlanner.getByRole("button", { name: "Suggest lineup" }).click();
    await expect(plusPlanner.getByTestId("planner-slot")).toHaveCount(3, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  const leadSlot = plusPlanner
    .getByTestId("planner-slot")
    .filter({ hasText: `Player ${accountOf(LEAD)}` });
  await expect(leadSlot.getByRole("list", { name: "Heroes for Pos 1" })).toContainText("Anti-Mage");
  await expect(leadSlot).toContainText("10–3");
  await expect(plusPlanner).not.toContainText("Hero picks for each position");
  await plusPlanner.getByRole("button", { name: "Post to Fixture Den" }).click();
  await expect(lead.getByText("Posted to Discord")).toBeVisible();
  const posted = await (await lead.request.get(`${FIXTURE}/discord/messages/${HOOK_ID}`)).json();
  expect(posted).toHaveLength(1);
  expect(posted[0].embeds[0].title).toBe("Tonight's lineup: Barkada stack");
  expect(posted[0].embeds[0].description).toContain("Pos 1 (Carry)");
  expect(posted[0].embeds[0].description).toContain("Anti-Mage 10–3");
  expect(posted[0].allowed_mentions).toEqual({ parse: [] });

  // Clean up so reruns against the same database start fresh.
  expect((await lead.request.delete(`/api/v1/groups/${id}`, { headers })).status()).toBe(200);
  await lead.request.delete("/api/v1/me/discord/webhook", { headers });
  for (const p of [lead, ...others, outsider]) await p.context().close();
});
