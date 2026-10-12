import { expect, test } from "@playwright/test";

// Each test has its own identity (tests in a file run in parallel) and its own webhook id.
const UI_LOGIN = "/api/v1/auth/steam/login?as=76561197960458881";
const POST_LOGIN = "/api/v1/auth/steam/login?as=76561197960458882";
const POST_ACCOUNT = 76561197960458882n - 76561197960265728n;
const API_LOGIN = "/api/v1/auth/steam/login?as=76561197960458883";

// The fixture server plays Discord (never the real one): its host is allowed in test mode only.
const FIXTURE = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 3101}`;
const TOKEN = `e2eToken_${"x".repeat(60)}`;
const hook = (id: string, token = TOKEN) => `${FIXTURE}/api/webhooks/${id}/${token}`;
const UI_HOOK = "100000000000000001";
const POST_HOOK = "100000000000000002";
const API_HOOK = "100000000000000003";

test("set up the Discord feed, test it, turn it off, and see when Discord deletes it", async ({
  page,
}) => {
  await page.goto(UI_LOGIN);
  await page.goto("/account");
  const card = page.getByRole("region", { name: "Discord", exact: true });
  const input = card.getByLabel("Webhook URL");
  const save = card.getByRole("button", { name: "Save webhook" });

  // Only Discord's own webhook URLs.
  await input.fill(`https://example.com/api/webhooks/${UI_HOOK}/${TOKEN}`);
  await save.click();
  await expect(card.getByRole("alert")).toContainText("isn't a Discord webhook URL");

  await input.fill(hook(UI_HOOK));
  await save.click();
  await expect(card.getByText("Posting to Fixture Den")).toBeVisible();
  await expect(card.getByText(`/api/webhooks/${UI_HOOK}/••••••••`)).toBeVisible();
  // The token is a secret: never sent back to the browser.
  await page.reload();
  await expect(card.getByText("Posting to Fixture Den")).toBeVisible();
  expect(await page.content()).not.toContain(TOKEN);

  await card.getByRole("button", { name: "Send a test post" }).click();
  await expect(page.getByText("Test post sent. Check the channel.")).toBeVisible();
  const messages = await (await page.request.get(`${FIXTURE}/discord/messages/${UI_HOOK}`)).json();
  expect(messages).toHaveLength(1);
  expect(messages[0].embeds[0].title).toBe("Dota Den is connected");
  expect(messages[0].allowed_mentions).toEqual({ parse: [] });

  const toggle = card.getByRole("checkbox", { name: /Post my finished matches/ });
  await expect(toggle).toBeChecked();
  const saved = page.waitForResponse("**/api/v1/me/discord/feed");
  await toggle.uncheck();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(toggle).not.toBeChecked();

  // The data export has the webhook, without its token.
  const exported = await (await page.request.get("/api/v1/me/export?format=json")).json();
  expect(exported.discordWebhook).toEqual([
    expect.objectContaining({ webhookId: UI_HOOK, name: "Fixture Den", enabled: false }),
  ]);
  expect(JSON.stringify(exported)).not.toContain(TOKEN);

  // Someone deletes the webhook in Discord: the next post finds out and posting stops.
  await page.request.delete(hook(UI_HOOK));
  await card.getByRole("button", { name: "Send a test post" }).click();
  await expect(card.getByRole("status")).toContainText("Discord says this webhook was deleted");
  await expect(toggle).toHaveCount(0);
  await page.reload();
  await expect(card.getByRole("status")).toContainText("Discord says this webhook was deleted");

  await card.getByRole("button", { name: "Remove webhook" }).click();
  await expect(page.getByText("Webhook removed.")).toBeVisible();
  await expect(card.getByRole("status")).toHaveCount(0);
  await expect(input).toBeVisible();
});

test("a match synced after setup is posted to the channel, with the real numbers", async ({
  request,
  baseURL,
}) => {
  const headers = { origin: new URL(baseURL!).origin };
  // Signs in without opening the dashboard (which would sync before the webhook exists).
  await request.get(POST_LOGIN);
  const saved = await request.put("/api/v1/me/discord/webhook", {
    data: { url: hook(POST_HOOK) },
    headers,
  });
  expect(saved.status()).toBe(200);
  const body = await saved.json();
  expect(body.data).toMatchObject({ connected: true, enabled: true, name: "Fixture Den" });
  expect(JSON.stringify(body)).not.toContain(TOKEN);

  const played = await (await request.post(`${FIXTURE}/e2e/play?account=${POST_ACCOUNT}`)).json();
  const sync = await request.post("/api/v1/me/matches/sync", { headers });
  expect(sync.status()).toBe(200);
  expect((await sync.json()).data.inserted).toBe(1);

  // Posted after the response (next/server after()).
  const posted = async () =>
    (await (await request.get(`${FIXTURE}/discord/messages/${POST_HOOK}`)).json()) as Array<{
      embeds: Array<Record<string, unknown>>;
    }>;
  await expect.poll(async () => (await posted()).length, { timeout: 20_000 }).toBe(1);
  const [message] = await posted();
  expect(message.embeds).toHaveLength(1);
  expect(message.embeds[0]).toMatchObject({
    title: "Win · Anti-Mage",
    url: `${new URL(baseURL!).origin}/matches/${played.match_id}`,
    color: 0x3fb950,
    footer: { text: `Dota Den · Match ${played.match_id}` },
  });
  expect(message.embeds[0].fields).toEqual(
    expect.arrayContaining([
      { name: "K / D / A", value: "9/1/14", inline: true },
      { name: "Duration", value: "34:05", inline: true },
      { name: "Mode", value: "All Pick · Ranked", inline: true },
      // Dota didn't record the party size: Unknown, never solo.
      { name: "Queue", value: "Unknown", inline: true },
    ]),
  );
});

test("Discord settings need a session, the same origin and a real Discord webhook", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const put = (url: string, headers: Record<string, string> = { origin }) =>
    request.put("/api/v1/me/discord/webhook", { data: { url }, headers });
  expect((await put(hook(API_HOOK), {})).status()).toBe(403);
  expect((await put(hook(API_HOOK))).status()).toBe(401);
  await request.get(API_LOGIN);
  // The server sends requests to this URL, so nothing but a Discord webhook gets through.
  for (const bad of [
    `http://discord.com/api/webhooks/${API_HOOK}/${TOKEN}`,
    `https://internal.example/api/webhooks/${API_HOOK}/${TOKEN}`,
    `https://discord.com.evil.example/api/webhooks/${API_HOOK}/${TOKEN}`,
    `https://discord.com/api/webhooks/${API_HOOK}/${TOKEN}?wait=true`,
    "http://169.254.169.254/latest/meta-data",
    `http://localhost:${process.env.FIXTURE_PORT ?? 3101}/api/webhooks/${API_HOOK}/${TOKEN}`,
    "not a url",
  ]) {
    expect((await put(bad)).status(), bad).toBe(400);
  }
  expect(
    (
      await request.put("/api/v1/me/discord/webhook", {
        data: { url: hook(API_HOOK), extra: 1 },
        headers: { origin },
      })
    ).status(),
  ).toBe(400);
  // A webhook Discord doesn't know is refused.
  expect((await put(hook(API_HOOK, `unknown${TOKEN}`))).status()).toBe(400);
  // Nothing saved yet.
  const feed = (data: unknown) =>
    request.put("/api/v1/me/discord/feed", { data, headers: { origin } });
  expect((await feed({ enabled: true })).status()).toBe(404);
  expect((await feed({ enabled: "yes" })).status()).toBe(400);
  expect((await request.post("/api/v1/me/discord/test", { headers: { origin } })).status()).toBe(
    404,
  );
});
