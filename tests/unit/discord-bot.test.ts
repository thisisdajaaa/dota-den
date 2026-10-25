import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_MESSAGE,
  commandOf,
  EPHEMERAL,
  meSummary,
  PONG,
  weeklyLeaderboard,
  type BotGame,
  type Interaction,
} from "@/modules/discord/domain/bot";
import { verifyInteraction } from "@/modules/discord/infrastructure/discord-oauth";
import type { DiscordLink, DiscordLinksPort } from "@/modules/discord/discord.ports";
import { DiscordBotService } from "@/modules/discord/services/discord-bot.service";
import { DiscordLinkService } from "@/modules/discord/services/discord-link.service";

const NOW = new Date("2026-10-25T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const g = (days: number, won: boolean, heroId = 1, ranked = true): BotGame => ({
  heroId,
  startedAt: ago(days),
  won,
  ranked,
});

describe("Discord interaction signatures", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // The raw 32-byte key, as Discord shows it (hex).
  const hex = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  const body = JSON.stringify({ type: 1 });
  const ts = "1761393600";
  const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");

  it("accepts Discord's signature over the timestamp and raw body only", () => {
    expect(verifyInteraction(hex, sig, ts, body)).toBe(true);
    expect(verifyInteraction(hex, sig, ts, body + " ")).toBe(false);
    expect(verifyInteraction(hex, sig, "1761393601", body)).toBe(false);
    expect(verifyInteraction(hex, null, ts, body)).toBe(false);
    expect(verifyInteraction(hex, "zz", ts, body)).toBe(false);
  });
});

describe("bot numbers", () => {
  it("/den me: the last week, the last ten games and the month's most played heroes", () => {
    const games = [g(1, true, 74), g(2, false, 74), g(3, true, 1), g(10, true, 74), g(40, true, 9)];
    expect(meSummary(games, NOW)).toEqual({
      week: { games: 3, wins: 2 },
      form: "WLWWW",
      heroes: [
        { heroId: 74, games: 3, wins: 2 },
        { heroId: 1, games: 1, wins: 1 },
      ],
    });
  });

  it("/den leaderboard: ranked wins this week, most wins first", () => {
    const rows = weeklyLeaderboard(
      [
        { discordId: "1", name: "Ana", games: [g(1, true), g(2, true), g(3, false)] },
        { discordId: "2", name: "Ben", games: [g(1, true), g(2, true)] },
        { discordId: "3", name: "Cy", games: [g(1, true, 1, false), g(20, true)] },
      ],
      NOW,
    );
    // Ben ties Ana on wins with fewer games; Cy has no ranked games this week.
    expect(rows.map((r) => r.name)).toEqual(["Ben", "Ana"]);
  });

  it("reads the subcommand", () => {
    const i = (name: string, sub?: string): Interaction => ({
      type: 2,
      data: { name, options: sub ? [{ name: sub, type: 1 }] : [] },
    });
    expect(commandOf(i("den", "me"))).toBe("me");
    expect(commandOf(i("den", "leaderboard"))).toBe("leaderboard");
    expect(commandOf(i("den", "nope"))).toBe("help");
    expect(commandOf(i("other", "me"))).toBe("help");
  });
});

const ANA: DiscordLink = {
  discordId: "111111111111111111",
  userId: "u1",
  accountId32: 7,
  username: "ana",
  globalName: "Ana_*",
  avatar: null,
  guilds: [],
  linkedAt: NOW,
};

function links(rows: DiscordLink[] = [ANA]): DiscordLinksPort & { remembered: string[] } {
  const remembered: string[] = [];
  return {
    remembered,
    forUser: async (id) => rows.find((r) => r.userId === id) ?? null,
    forDiscord: async (id) => rows.find((r) => r.discordId === id) ?? null,
    inGuild: async () => rows,
    link: async () => {},
    rememberGuild: async (_d, gid) => void remembered.push(gid),
    unlink: async () => true,
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
}

function bot(store = links()) {
  return new DiscordBotService({
    links: store,
    games: async () => [g(1, true, 74), g(2, false, 74)],
    heroName: async (id) => (id === 74 ? "Invoker" : `Hero #${id}`),
    translator: async () => (key, vars) => `${key}${vars ? JSON.stringify(vars) : ""}`,
    appUrl: "https://www.dota-den.com",
    logger: { warn: vi.fn() },
    now: () => NOW,
  });
}

const command = (sub: string, over: Partial<Interaction> = {}): Interaction => ({
  type: 2,
  guild_id: "222222222222222222",
  member: { user: { id: ANA.discordId, username: "ana" } },
  data: { name: "den", options: [{ name: sub, type: 1 }] },
  ...over,
});

describe("DiscordBotService", () => {
  it("answers Discord's ping", async () => {
    expect(await bot().handle({ type: 1 })).toEqual({ type: PONG });
  });

  it("/den me posts the caller's week with mentions off, and remembers the server", async () => {
    const store = links();
    const res = await bot(store).handle(command("me"));
    expect(res.type).toBe(CHANNEL_MESSAGE);
    expect(res.data).toMatchObject({ allowed_mentions: { parse: [] } });
    const embed = (res.data!.embeds as { url: string; fields: { value: string }[] }[])[0];
    expect(embed.url).toBe("https://www.dota-den.com/players/7");
    expect(embed.fields[1].value).toBe("WL");
    expect(embed.fields[2].value).toContain("Invoker");
    expect(store.remembered).toEqual(["222222222222222222"]);
  });

  it("tells someone who isn't linked how to link, privately", async () => {
    const res = await bot(links([])).handle(command("me"));
    expect(res.data).toMatchObject({ flags: EPHEMERAL });
    expect(String(res.data!.content)).toContain("discord.bot.notLinked");
  });

  it("ranks the server's linked members, escaping their names", async () => {
    const res = await bot().handle(command("leaderboard"));
    const embed = (res.data!.embeds as { description: string }[])[0];
    expect(embed.description).toContain("**Ana\\_\\***");
    const dm = await bot().handle(command("leaderboard", { guild_id: undefined }));
    expect(String(dm.data!.content)).toContain("discord.bot.serverOnly");
  });
});

describe("DiscordLinkService", () => {
  const oauth = {
    authorizeUrl: (state: string) => `https://discord.com/oauth2/authorize?state=${state}`,
    identify: vi.fn(async () => ({
      id: "333333333333333333",
      username: "b",
      globalName: null,
      avatar: null,
    })),
  };

  it("links only with a matching state and a code Discord accepts", async () => {
    const store = links([]);
    const link = vi.spyOn(store, "link");
    const svc = new DiscordLinkService({ oauth, links: store, now: () => NOW });
    const start = svc.begin()!;
    expect(start.url).toContain(start.state);
    const user = { id: "u2", accountId32: 8 };
    expect(await svc.finish(user, { code: "c", state: "x", cookieState: start.state })).toBe(
      "bad_state",
    );
    expect(
      await svc.finish(user, { code: null, state: start.state, cookieState: start.state }),
    ).toBe("denied");
    expect(
      await svc.finish(user, { code: "c", state: start.state, cookieState: start.state }),
    ).toBe("linked");
    expect(link).toHaveBeenCalledWith(
      expect.objectContaining({ discordId: "333333333333333333", userId: "u2" }),
      NOW,
    );
  });

  it("is off without the Discord app", async () => {
    const svc = new DiscordLinkService({ oauth: null, links: links([]) });
    expect(svc.begin()).toBeNull();
    expect(await svc.status("u1")).toEqual({ enabled: false, linked: null });
  });
});
