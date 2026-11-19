import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_DISCORD_APP_ID, signInteraction } from "./support/discord-bot";

// Its own identity (not an admin, so no staff Plus) and its own fake Discord server.
const LOGIN = "/api/v1/auth/steam/login?as=76561197960459901";
const FIXTURE = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 3101}`;
// The fixture's fake Discord signs everyone in as this user.
const DISCORD_USER = { id: "700000000000000001", username: "fixtureden" };
const GUILD = "740000000000000001";
const CHANNEL = "740000000000000002";
const MANAGE_SERVER = String(1n << 5n);

let n = 0;
function interaction(
  sub: string,
  options: { name: string; type: number; value: unknown }[] = [],
  member: { permissions?: string; user?: typeof DISCORD_USER } = {},
) {
  n++;
  return {
    type: 2,
    id: `75000000000000000${n}`,
    application_id: E2E_DISCORD_APP_ID,
    token: `e2eInteractionToken-${Date.now()}-${n}`,
    guild_id: GUILD,
    channel_id: CHANNEL,
    member: { user: member.user ?? DISCORD_USER, permissions: member.permissions ?? "0" },
    data: { name: "den", options: [{ name: sub, type: 1, options }] },
  };
}

async function send(request: APIRequestContext, payload: unknown) {
  const body = JSON.stringify(payload);
  const res = await request.post("/api/v1/discord/interactions", {
    headers: signInteraction(body),
    data: body,
  });
  return { status: res.status(), json: await res.json() };
}

test("interactions are verified: ping, bad signatures, and strangers get the link", async ({
  request,
}) => {
  expect(await send(request, { type: 1 })).toEqual({ status: 200, json: { type: 1 } });

  const body = JSON.stringify({ type: 1 });
  const forged = await request.post("/api/v1/discord/interactions", {
    headers: { ...signInteraction(body), "x-signature-ed25519": "0".repeat(128) },
    data: body,
  });
  expect(forged.status()).toBe(401);
  const unsigned = await request.post("/api/v1/discord/interactions", { data: body });
  expect(unsigned.status()).toBe(401);

  const stranger = await send(
    request,
    interaction("me", [], { user: { id: "760000000000000001", username: "stranger" } }),
  );
  expect(stranger.json.type).toBe(4);
  expect(stranger.json.data.flags).toBe(64);
  expect(stranger.json.data.content).toContain("Link your Discord to Dota Den first");
});

test("link Discord on the account page, use the bot, set nudges, and unlink", async ({
  page,
  request,
}) => {
  await page.goto(LOGIN);
  await page.goto("/account");
  const card = page.getByRole("region", { name: "Discord account" });
  await expect(card.getByRole("link", { name: "Add the bot to your server" })).toHaveAttribute(
    "href",
    /client_id=100000000000000099.*scope=bot\+applications\.commands/,
  );

  // Off to (fake) Discord and back, linked.
  await card.getByRole("link", { name: "Connect Discord" }).click();
  await expect(page).toHaveURL(/\/account\?discord=linked/);
  await expect(card.getByText("Discord linked.")).toBeVisible();
  await expect(card.getByText("Linked as Fixture Discord")).toBeVisible();

  // Now the bot knows who it is.
  const me = await send(request, interaction("me"));
  expect(me.json.type).toBe(4);
  expect(me.json.data.embeds[0].title).toBe("Fixture Discord on Dota Den");
  expect(me.json.data.allowed_mentions).toEqual({ parse: [] });

  // Plus commands say so (this player has no Plus) without doing any work.
  const coach = await send(request, interaction("coach"));
  expect(coach.json.data.content).toContain("Dota Den Plus command");

  // A server admin sets up nudges: "thinking…" first, then the answer is edited in.
  const setup = interaction("setup", [{ name: "nudges", type: 5, value: true }], {
    permissions: MANAGE_SERVER,
  });
  expect((await send(request, setup)).json).toEqual({ type: 5, data: { flags: 64 } });
  await expect
    .poll(async () =>
      (await (await request.get(`${FIXTURE}/discord/bot-log/${setup.token}`)).json())
        .map((m: { content?: string }) => m.content ?? "")
        .join(" "),
    )
    .toContain(`Saved. Channel: <#${CHANNEL}>`);
  const hello = await (await request.get(`${FIXTURE}/discord/bot-log/${CHANNEL}`)).json();
  expect(hello[0].content).toContain("Dota Den will post here");

  // A member who isn't an admin can't.
  const notAdmin = interaction("setup", [{ name: "recap", type: 5, value: true }]);
  await send(request, notAdmin);
  await expect
    .poll(async () =>
      JSON.stringify(
        await (await request.get(`${FIXTURE}/discord/bot-log/${notAdmin.token}`)).json(),
      ),
    )
    .toContain("Only people with Manage Server");

  // Nudges into this server's channel, then by DM from the account page.
  const nudges = await send(
    request,
    interaction("nudges", [{ name: "where", type: 3, value: "server" }]),
  );
  expect(nudges.json.data.content).toContain(`Nudges in <#${CHANNEL}>`);
  await page.reload();
  await expect(card.getByLabel("In a server channel (set with /den nudges)")).toBeChecked();
  // A click before hydration doesn't reach React: retry until the save goes through.
  await expect(async () => {
    await card.getByLabel("Direct message").click();
    await expect(card.getByText("Saved.")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.reload();
  await expect(card.getByLabel("Direct message")).toBeChecked();

  await card.getByRole("button", { name: "Unlink" }).click();
  await expect(card.getByRole("link", { name: "Connect Discord" })).toBeVisible();
  const after = await send(request, interaction("me"));
  expect(after.json.data.content).toContain("Link your Discord to Dota Den first");
});
