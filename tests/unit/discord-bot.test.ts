import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/common/errors/app-error";
import {
  AUTOCOMPLETE_RESULT,
  botLocale,
  canManageGuild,
  CHANNEL_MESSAGE,
  DEFERRED_CHANNEL_MESSAGE,
  EPHEMERAL,
  meSummary,
  parseCommand,
  PONG,
  weeklyLeaderboard,
  type BotGame,
  type Interaction,
} from "@/modules/discord/domain/bot";
import { DEN_COMMANDS } from "@/modules/discord/domain/commands";
import { heroChoices, resolveHero } from "@/modules/discord/domain/hero-match";
import {
  lastRecapWeek,
  nudgeTarget,
  recapJobKey,
  serverRecap,
} from "@/modules/discord/domain/server";
import type {
  BotFeatures,
  BotLogPort,
  BotMessage,
  DiscordApiPort,
  DiscordGuildsPort,
  DiscordLink,
  DiscordLinksPort,
  StoredGuild,
} from "@/modules/discord/discord.ports";
import { AppBotFeatures } from "@/modules/discord/infrastructure/app-bot-features";
import { verifyInteraction } from "@/modules/discord/infrastructure/discord-oauth";
import { DiscordBotService } from "@/modules/discord/services/discord-bot.service";
import { DiscordLinkService } from "@/modules/discord/services/discord-link.service";
import { DiscordServerService } from "@/modules/discord/services/discord-server.service";

const NOW = new Date("2026-10-25T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const g = (days: number, won: boolean, heroId = 1, ranked = true): BotGame => ({
  heroId,
  startedAt: ago(days),
  won,
  ranked,
});
const GUILD = "222222222222222222";
const CHANNEL = "444444444444444444";
const APP = "555555555555555555";
const TOKEN = `aW50ZXJhY3Rpb246${"x".repeat(40)}`;
const HEROES = [
  { id: 1, name: "Anti-Mage" },
  { id: 14, name: "Pudge" },
  { id: 26, name: "Lion" },
  { id: 41, name: "Faceless Void" },
  { id: 44, name: "Phantom Assassin" },
  { id: 74, name: "Invoker" },
  { id: 126, name: "Void Spirit" },
];

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
    expect(verifyInteraction(hex, sig, null, body)).toBe(false);
    expect(verifyInteraction(hex, "zz", ts, body)).toBe(false);
  });

  it("refuses a signature made with another key, and a malformed public key", () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    const forged = sign(null, Buffer.from(ts + body), other).toString("hex");
    expect(verifyInteraction(hex, forged, ts, body)).toBe(false);
    expect(verifyInteraction("abcd", sig, ts, body)).toBe(false);
  });
});

const sub = (name: string, options: { name: string; type: number; value?: unknown }[] = []) =>
  ({
    type: 2,
    data: { name: "den", options: [{ name, type: 1, options }] },
  }) as Interaction;

describe("command parsing", () => {
  it("reads each subcommand and its options", () => {
    expect(parseCommand(sub("me"))).toEqual({ name: "me" });
    expect(parseCommand(sub("leaderboard"))).toEqual({ name: "leaderboard" });
    expect(parseCommand(sub("lang", [{ name: "language", type: 3, value: "ceb" }]))).toEqual({
      name: "lang",
      language: "ceb",
    });
    expect(
      parseCommand(
        sub("coach", [
          { name: "match", type: 3, value: "8123456789" },
          { name: "share", type: 5, value: true },
        ]),
      ),
    ).toEqual({ name: "coach", matchId: "8123456789", share: true });
    expect(
      parseCommand(
        sub("pick", [
          { name: "enemy1", type: 3, value: "26" },
          { name: "enemy3", type: 3, value: "pa" },
          { name: "ally1", type: 3, value: "pudge" },
          { name: "position", type: 4, value: 2 },
        ]),
      ),
    ).toEqual({
      name: "pick",
      enemies: ["26", "pa"],
      allies: ["pudge"],
      position: 2,
      share: false,
    });
    expect(
      parseCommand(
        sub("setup", [
          { name: "channel", type: 7, value: CHANNEL },
          { name: "recap", type: 5, value: true },
        ]),
      ),
    ).toEqual({ name: "setup", channelId: CHANNEL, recap: true, nudges: null, language: null });
    expect(parseCommand(sub("nudges", [{ name: "where", type: 3, value: "dm" }]))).toEqual({
      name: "nudges",
      where: "dm",
    });
    expect(parseCommand(sub("recap", [{ name: "on", type: 5, value: false }]))).toEqual({
      name: "recap",
      on: false,
    });
  });

  it("drops bad values instead of trusting them, and anything unknown is help", () => {
    expect(parseCommand(sub("lang", [{ name: "language", type: 3, value: "de" }]))).toEqual({
      name: "lang",
      language: null,
    });
    expect(parseCommand(sub("coach", [{ name: "match", type: 3, value: "abc" }]))).toMatchObject({
      matchId: null,
    });
    expect(parseCommand(sub("pick", [{ name: "position", type: 4, value: 9 }]))).toMatchObject({
      position: null,
    });
    expect(parseCommand(sub("nudges", [{ name: "where", type: 3, value: "all" }]))).toEqual({
      name: "nudges",
      where: null,
    });
    // A question is required.
    expect(parseCommand(sub("ask"))).toEqual({ name: "help" });
    expect(
      parseCommand(sub("ask", [{ name: "question", type: 3, value: "x".repeat(600) }])),
    ).toMatchObject({ question: "x".repeat(500) });
    expect(parseCommand(sub("nope"))).toEqual({ name: "help" });
    expect(parseCommand({ type: 2, data: { name: "other" } })).toEqual({ name: "help" });
  });

  it("registers exactly the subcommands the parser reads", () => {
    for (const o of DEN_COMMANDS[0].options) {
      const opts = o.name === "ask" ? [{ name: "question", type: 3, value: "hi" }] : [];
      const parsed = parseCommand(sub(o.name, opts));
      expect(parsed.name).toBe(o.name);
    }
    expect(DEN_COMMANDS[0].options.length).toBeLessThanOrEqual(25);
  });
});

describe("permissions and language", () => {
  it("only Manage Server or Administrator may set the bot up", () => {
    expect(canManageGuild(String(1n << 5n))).toBe(true);
    expect(canManageGuild(String(1n << 3n))).toBe(true);
    // A big bitfield past 2^53 (BigInt, never Number).
    expect(canManageGuild(String((1n << 40n) | (1n << 5n)))).toBe(true);
    expect(canManageGuild(String((1n << 40n) | 2048n))).toBe(false);
    expect(canManageGuild(undefined)).toBe(false);
    expect(canManageGuild("-1")).toBe(false);
  });

  it("speaks the player's language, else the server's, else English", () => {
    expect(botLocale({ userLanguage: "fil", guildLanguage: "ceb" })).toBe("fil");
    expect(botLocale({ userLanguage: null, guildLanguage: "ceb" })).toBe("ceb");
    expect(botLocale({ userLanguage: "xx", guildLanguage: undefined })).toBe("en");
  });
});

describe("hero names", () => {
  it("takes an id from the list, a name, a prefix or a nickname, and never guesses nonsense", () => {
    expect(resolveHero("26", HEROES)).toEqual({ ok: true, hero: HEROES[2] });
    expect(resolveHero("pudge", HEROES)).toMatchObject({ hero: { id: 14 } });
    expect(resolveHero("inv", HEROES)).toMatchObject({ hero: { id: 74 } });
    expect(resolveHero("pa", HEROES)).toMatchObject({ hero: { id: 44 } });
    expect(resolveHero("am", HEROES)).toMatchObject({ hero: { id: 1 } });
    expect(resolveHero("void", HEROES)).toMatchObject({ hero: { id: 41 } });
    expect(resolveHero("zzzz", HEROES)).toEqual({ ok: false, input: "zzzz" });
    expect(resolveHero("9999", HEROES)).toEqual({ ok: false, input: "9999" });
  });

  it("autocompletes A–Z when empty and best matches first", () => {
    expect(heroChoices("", HEROES, 2).map((h) => h.name)).toEqual(["Anti-Mage", "Faceless Void"]);
    expect(heroChoices("void", HEROES).map((h) => h.name)).toEqual([
      "Faceless Void",
      "Void Spirit",
    ]);
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

  it("the Monday recap covers last Monday–Sunday in Manila time, ranked games only", () => {
    // Sunday 2026-10-25 20:00 Manila: the last finished week is 2026-10-12..18.
    expect(lastRecapWeek(NOW)).toBe("2026-10-12");
    const at = (iso: string, won: boolean, heroId = 14, ranked = true): BotGame => ({
      heroId,
      startedAt: new Date(iso),
      won,
      ranked,
    });
    const recap = serverRecap(
      [
        {
          discordId: "1",
          name: "Ana",
          games: [
            // Monday 00:30 Manila is still Sunday in UTC: in the week.
            at("2026-10-11T16:30:00Z", true),
            at("2026-10-18T15:00:00Z", true, 26),
            // Monday 00:30 Manila of the next week: out.
            at("2026-10-18T16:30:00Z", true),
            at("2026-10-14T10:00:00Z", false, 14, false),
          ],
        },
        { discordId: "2", name: "Ben", games: [at("2026-10-13T10:00:00Z", false)] },
        { discordId: "3", name: "Cy", games: [] },
      ],
      "2026-10-12",
    );
    expect(recap).toMatchObject({
      players: 2,
      games: 3,
      wins: 2,
      hero: { heroId: 14, games: 2, wins: 1 },
    });
    expect(recap!.top.map((r) => [r.name, r.wins, r.games])).toEqual([
      ["Ana", 2, 2],
      ["Ben", 0, 1],
    ]);
    expect(serverRecap([{ discordId: "3", name: "Cy", games: [] }], "2026-10-12")).toBeNull();
  });

  it("recap job keys are QStash-safe (letters, digits, '-')", () => {
    expect(recapJobKey(GUILD, "2026-10-12")).toMatch(/^[A-Za-z0-9-]+$/);
    expect(() => recapJobKey("a:b", "2026-10-12")).toThrow();
  });
});

describe("nudge opt-in", () => {
  const guild = { guildId: GUILD, channelId: CHANNEL, recap: false, nudges: true };
  const member = { discordId: "1", guilds: [GUILD] };

  it("goes nowhere unless the member asked for it", () => {
    expect(nudgeTarget({ ...member, nudges: null }, guild)).toBeNull();
    expect(nudgeTarget({ ...member, nudges: { where: "dm", guildId: null } }, null)).toEqual({
      kind: "dm",
      discordId: "1",
    });
  });

  it("goes to a server only while that server takes nudges and they're a member there", () => {
    const server = { ...member, nudges: { where: "server" as const, guildId: GUILD } };
    expect(nudgeTarget(server, guild)).toEqual({
      kind: "channel",
      channelId: CHANNEL,
      guildId: GUILD,
    });
    expect(nudgeTarget(server, { ...guild, nudges: false })).toBeNull();
    expect(nudgeTarget(server, { ...guild, channelId: null })).toBeNull();
    expect(nudgeTarget({ ...server, guilds: [] }, guild)).toBeNull();
    expect(nudgeTarget(server, null)).toBeNull();
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
  recapGuilds: [],
  nudges: null,
  linkedAt: NOW,
};

function links(rows: DiscordLink[] = [{ ...ANA }]) {
  const remembered: string[] = [];
  const store: DiscordLinksPort & { remembered: string[]; rows: DiscordLink[] } = {
    rows,
    remembered,
    forUser: async (id) => rows.find((r) => r.userId === id) ?? null,
    forDiscord: async (id) => rows.find((r) => r.discordId === id) ?? null,
    inGuild: async () => rows,
    recapMembers: async (gid) => rows.filter((r) => r.recapGuilds.includes(gid)),
    link: async () => {},
    rememberGuild: async (_d, gid) => void remembered.push(gid),
    setRecap: async (d, gid, on) => {
      const r = rows.find((x) => x.discordId === d)!;
      r.recapGuilds = on ? [...r.recapGuilds, gid] : r.recapGuilds.filter((x) => x !== gid);
    },
    setNudges: async (uid, n) => {
      const r = rows.find((x) => x.userId === uid);
      if (r) r.nudges = n;
      return !!r;
    },
    nudgeUserIds: async () => rows.filter((r) => r.nudges).map((r) => r.userId),
    unlink: async () => true,
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  return store;
}

function guilds(initial: StoredGuild[] = []) {
  const rows = new Map(initial.map((x) => [x.guildId, x]));
  const port: DiscordGuildsPort & { rows: Map<string, StoredGuild> } = {
    rows,
    get: async (id) => rows.get(id) ?? null,
    save: async (x) =>
      void rows.set(x.guildId, { ...x, lastRecapWeek: rows.get(x.guildId)?.lastRecapWeek ?? null }),
    withRecap: async () => [...rows.values()].filter((x) => x.recap && x.channelId),
    markRecapped: async (id, week) => {
      rows.get(id)!.lastRecapWeek = week;
    },
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  return port;
}

function api(canPost = true) {
  const sent: { to: string; message: BotMessage }[] = [];
  const port: DiscordApiPort & { sent: typeof sent; answer: BotPostOutcomeFn } = {
    sent,
    canPost,
    answer: () => ({ kind: "ok" }),
    editOriginal: async (appId, token, message) => {
      sent.push({ to: `edit:${appId}:${token.length}`, message });
      return { kind: "ok" };
    },
    postToChannel: async (id, message) => {
      sent.push({ to: `channel:${id}`, message });
      return port.answer();
    },
    directMessage: async (id, message) => {
      sent.push({ to: `dm:${id}`, message });
      return port.answer();
    },
  };
  return port;
}
type BotPostOutcomeFn = () => Awaited<ReturnType<DiscordApiPort["postToChannel"]>>;

function features(over: Partial<BotFeatures> = {}): BotFeatures {
  return {
    games: async () => [g(1, true, 74), g(2, false, 74)],
    heroes: async () => HEROES,
    userLanguage: async () => null,
    setLanguage: async () => {},
    isPlus: async () => true,
    coach: async () => ({ kind: "no_match" }),
    ask: async () => ({ kind: "answer", text: "You won 1 of 2.", remaining: 4, limit: 5 }),
    pick: async () => ({ kind: "ok", suggestions: [], poolSize: 0, highRank: true }),
    ...over,
  };
}

const t =
  (locale = "en") =>
  (key: string, vars?: Record<string, string | number>) =>
    `${locale}:${key}${vars ? JSON.stringify(vars) : ""}`;

function bot(
  opts: {
    store?: ReturnType<typeof links>;
    guildStore?: ReturnType<typeof guilds>;
    api?: ReturnType<typeof api>;
    features?: BotFeatures;
    limit?: (key: string) => Promise<boolean>;
  } = {},
) {
  return new DiscordBotService({
    links: opts.store ?? links(),
    guilds: opts.guildStore ?? guilds(),
    features: opts.features ?? features(),
    api: opts.api ?? api(),
    translator: (locale) => t(locale),
    limit: opts.limit ?? (async () => true),
    appUrl: "https://www.dota-den.com",
    logger: { warn: vi.fn(), info: vi.fn() },
    now: () => NOW,
  });
}

const command = (
  name: string,
  options: { name: string; type: number; value?: unknown }[] = [],
  over: Partial<Interaction> = {},
): Interaction => ({
  ...sub(name, options),
  id: "666666666666666666",
  application_id: APP,
  token: TOKEN,
  guild_id: GUILD,
  channel_id: CHANNEL,
  member: { user: { id: ANA.discordId, username: "ana" }, permissions: "0" },
  ...over,
});

const content = (r: { data?: Record<string, unknown> }) => String(r.data?.content ?? "");

describe("DiscordBotService", () => {
  it("answers Discord's ping", async () => {
    expect((await bot().handle({ type: 1 })).reply).toEqual({ type: PONG });
  });

  it("/den me posts the caller's week with mentions off, and remembers the server", async () => {
    const store = links();
    const { reply } = await bot({ store }).handle(command("me"));
    expect(reply.type).toBe(CHANNEL_MESSAGE);
    expect(reply.data).toMatchObject({ allowed_mentions: { parse: [] } });
    const embed = (reply.data!.embeds as { url: string; fields: { value: string }[] }[])[0];
    expect(embed.url).toBe("https://www.dota-den.com/players/7");
    expect(embed.fields[1].value).toBe("WL");
    expect(embed.fields[2].value).toContain("Invoker");
    expect(store.remembered).toEqual([GUILD]);
  });

  it("tells someone who isn't linked how to link, privately", async () => {
    const { reply } = await bot({ store: links([]) }).handle(command("me"));
    expect(reply.data).toMatchObject({ flags: EPHEMERAL });
    expect(content(reply)).toContain("discord.bot.notLinked");
  });

  it("ranks the server's linked members, escaping their names", async () => {
    const { reply } = await bot().handle(command("leaderboard"));
    const embed = (reply.data!.embeds as { description: string }[])[0];
    expect(embed.description).toContain("**Ana\\_\\***");
    const dm = await bot().handle(command("leaderboard", [], { guild_id: undefined }));
    expect(content(dm.reply)).toContain("discord.bot.serverOnly");
  });

  it("replies in the player's site language, else the server's", async () => {
    const fil = await bot({ features: features({ userLanguage: async () => "fil" }) }).handle(
      command("recap"),
    );
    expect(content(fil.reply)).toMatch(/^fil:/);
    const server = guilds([
      {
        guildId: GUILD,
        channelId: CHANNEL,
        recap: true,
        nudges: false,
        language: "ceb",
        userId: "u9",
        setupByDiscordId: "9".repeat(18),
        lastRecapWeek: null,
      },
    ]);
    const ceb = await bot({ guildStore: server }).handle(command("recap"));
    expect(content(ceb.reply)).toMatch(/^ceb:/);
  });

  it("/den lang saves the site language and confirms in it", async () => {
    const setLanguage = vi.fn(async () => {});
    const { reply } = await bot({ features: features({ setLanguage }) }).handle(
      command("lang", [{ name: "language", type: 3, value: "ceb" }]),
    );
    expect(setLanguage).toHaveBeenCalledWith("u1", "ceb");
    expect(content(reply)).toMatch(/^ceb:discord\.bot\.langSet/);
  });

  it("keeps Plus commands for Plus members, before any work is done", async () => {
    const coach = vi.fn();
    const { reply, later } = await bot({
      features: features({ isPlus: async () => false, coach }),
    }).handle(command("coach"));
    expect(content(reply)).toContain("discord.bot.plusOnly");
    expect(later).toBeUndefined();
    expect(coach).not.toHaveBeenCalled();
  });

  it("rate limits per Discord user, tighter for AI commands", async () => {
    const keys: string[] = [];
    const limit = async (key: string) => {
      keys.push(key);
      return !key.includes(":ai:");
    };
    expect(content((await bot({ limit }).handle(command("me"))).reply)).not.toContain("slowDown");
    const { reply, later } = await bot({ limit }).handle(
      command("ask", [{ name: "question", type: 3, value: "how am I doing?" }]),
    );
    expect(content(reply)).toContain("discord.bot.slowDown");
    expect(later).toBeUndefined();
    expect(keys).toEqual([`discord:cmd:${ANA.discordId}`, `discord:ai:${ANA.discordId}`]);
  });

  it("defers slow commands (private unless shared) and edits the answer in later", async () => {
    const out = api();
    const ask = vi.fn(features().ask);
    const res = await bot({ api: out, features: features({ ask }) }).handle(
      command("ask", [{ name: "question", type: 3, value: "how am I doing?" }]),
    );
    expect(res.reply).toEqual({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });
    expect(out.sent).toEqual([]);
    await res.later!();
    expect(ask).toHaveBeenCalledWith({ id: "u1", accountId32: 7 }, "how am I doing?", "en");
    expect(out.sent[0].to).toBe(`edit:${APP}:${TOKEN.length}`);
    expect(out.sent[0].message.content).toContain("You won 1 of 2.");
    expect(out.sent[0].message.content).toContain('"remaining":4');

    const shared = await bot().handle(command("coach", [{ name: "share", type: 5, value: true }]));
    expect(shared.reply.data).toEqual({ flags: 0 });
  });

  it("says when the shared Ask Den allowance is used up, and survives a failure", async () => {
    const out = api();
    const res = await bot({
      api: out,
      features: features({
        ask: async () => ({ kind: "quota", resetsAt: "2026-10-25T16:00:00Z" }),
      }),
    }).handle(command("ask", [{ name: "question", type: 3, value: "hi" }]));
    await res.later!();
    expect(out.sent[0].message.content).toContain("discord.bot.ask.quota");

    const broken = api();
    const failing = await bot({
      api: broken,
      features: features({
        coach: async () => {
          throw new Error("boom");
        },
      }),
    }).handle(command("coach"));
    await failing.later!();
    expect(broken.sent[0].message.content).toContain("discord.bot.error");
  });

  it("shows the coach's stored points with numbers from the fact sheet", async () => {
    const out = api();
    const res = await bot({
      api: out,
      features: features({
        coach: async () => ({
          kind: "review",
          matchId: "8000000001",
          heroId: 74,
          cached: true,
          points: [
            {
              kind: "improve",
              title: "Farm faster",
              detail: "Your farm at minute 10 was low.",
              facts: [{ base: "lastHits10", subject: null, value: 38, unit: "count" }],
            },
          ],
        }),
      }),
    }).handle(command("coach"));
    await res.later!();
    const embed = out.sent[0].message.embeds![0] as {
      title: string;
      fields: { name: string; value: string }[];
    };
    expect(embed.title).toContain("Invoker");
    expect(embed.fields[0].value).toContain("matches.coach.facts.lastHits10");
    expect(embed.fields[0].value).toContain(": 38");
  });

  it("/den pick resolves typed heroes, and lists unknown ones instead of guessing", async () => {
    const out = api();
    const pick = vi.fn(async () => ({
      kind: "ok" as const,
      poolSize: 3,
      highRank: true,
      suggestions: [
        {
          heroId: 14,
          you: { games: 10, wins: 6 },
          counters: [{ heroId: 26, points: 2.1, games: 1234 }],
          allies: [],
        },
      ],
    }));
    const res = await bot({ api: out, features: features({ pick }) }).handle(
      command("pick", [
        { name: "enemy1", type: 3, value: "26" },
        { name: "enemy2", type: 3, value: "lion" },
        { name: "position", type: 4, value: 4 },
      ]),
    );
    await res.later!();
    expect(pick).toHaveBeenCalledWith(
      { id: "u1", accountId32: 7 },
      { enemies: [26], allies: [], position: 4 },
    );
    const embed = out.sent[0].message.embeds![0] as { description: string };
    expect(embed.description).toContain("**Pudge**");
    expect(embed.description).toContain('"points":"+2.1"');

    const unknown = api();
    const bad = await bot({ api: unknown, features: features({ pick }) }).handle(
      command("pick", [{ name: "enemy1", type: 3, value: "qwerty" }]),
    );
    await bad.later!();
    expect(unknown.sent[0].message.content).toContain("discord.bot.pick.unknown");
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("autocompletes hero names with ids as values", async () => {
    const { reply } = await bot().handle({
      type: 4,
      data: {
        name: "den",
        options: [
          {
            name: "pick",
            type: 1,
            options: [{ name: "enemy1", type: 3, value: "pu", focused: true }],
          },
        ],
      },
    });
    expect(reply).toEqual({
      type: AUTOCOMPLETE_RESULT,
      data: { choices: [{ name: "Pudge", value: "14" }] },
    });
  });

  it("/den setup: Manage Server only; turning the recap on needs Plus; checks it can post", async () => {
    const admin = { user: { id: ANA.discordId, username: "ana" }, permissions: String(1n << 5n) };
    const recapOn = [{ name: "recap", type: 5, value: true }];

    const out = api();
    const store = guilds();
    const notAdmin = await bot({ api: out, guildStore: store }).handle(command("setup", recapOn));
    await notAdmin.later!();
    expect(out.sent[0].message.content).toContain("discord.bot.setup.notAdmin");

    const free = await bot({
      api: out,
      guildStore: store,
      features: features({ isPlus: async () => false }),
    }).handle(command("setup", recapOn, { member: admin }));
    // /den setup isn't a Plus command; its recap is.
    await free.later!();
    expect(out.sent[1].message.content).toContain("discord.bot.setup.recapPlus");
    expect(store.rows.size).toBe(0);

    const ok = await bot({ api: out, guildStore: store }).handle(
      command("setup", recapOn, { member: admin }),
    );
    await ok.later!();
    expect(out.sent[2].to).toBe(`channel:${CHANNEL}`);
    expect(out.sent[3].message.content).toContain("discord.bot.setup.saved");
    expect(store.rows.get(GUILD)).toMatchObject({ channelId: CHANNEL, recap: true, userId: "u1" });

    const blocked = api();
    blocked.answer = () => ({ kind: "forbidden", status: 403 });
    const cant = await bot({ api: blocked, guildStore: guilds() }).handle(
      command("setup", recapOn, { member: admin }),
    );
    await cant.later!();
    expect(blocked.sent[1].message.content).toContain("discord.bot.setup.cantPost");
  });

  it("/den recap and /den nudges are each member's own opt-in", async () => {
    const store = links();
    const server = guilds([
      {
        guildId: GUILD,
        channelId: CHANNEL,
        recap: true,
        nudges: false,
        language: null,
        userId: "u9",
        setupByDiscordId: "9".repeat(18),
        lastRecapWeek: null,
      },
    ]);
    const b = bot({ store, guildStore: server });
    await b.handle(command("recap", [{ name: "on", type: 5, value: true }]));
    expect(store.rows[0].recapGuilds).toEqual([GUILD]);
    const serverOff = await b.handle(
      command("nudges", [{ name: "where", type: 3, value: "server" }]),
    );
    expect(content(serverOff.reply)).toContain("discord.bot.nudges.serverOff");
    expect(store.rows[0].nudges).toBeNull();
    await b.handle(command("nudges", [{ name: "where", type: 3, value: "dm" }]));
    expect(store.rows[0].nudges).toEqual({ where: "dm", guildId: null });
    await b.handle(command("nudges", [{ name: "where", type: 3, value: "off" }]));
    expect(store.rows[0].nudges).toBeNull();
  });
});

function botLog() {
  const claimed = new Map<string, boolean>();
  const port: BotLogPort & { claimed: Map<string, boolean> } = {
    claimed,
    claim: async (id) => {
      if (claimed.has(id)) return false;
      claimed.set(id, false);
      return true;
    },
    release: async (id) => {
      if (claimed.get(id) === false) claimed.delete(id);
    },
    markSent: async (id) => void claimed.set(id, true),
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
  return port;
}

const RECAP_GUILD: StoredGuild = {
  guildId: GUILD,
  channelId: CHANNEL,
  recap: true,
  nudges: true,
  language: "fil",
  userId: "u9",
  setupByDiscordId: "9".repeat(18),
  lastRecapWeek: null,
};

function server(
  opts: {
    store?: ReturnType<typeof links>;
    guildStore?: ReturnType<typeof guilds>;
    api?: ReturnType<typeof api>;
    log?: ReturnType<typeof botLog>;
    isPlus?: (id: string) => Promise<boolean>;
    enqueue?: (job: { guildId: string; week: string }) => Promise<void>;
  } = {},
) {
  return new DiscordServerService({
    links: opts.store ?? links(),
    guilds: opts.guildStore ?? guilds([{ ...RECAP_GUILD }]),
    log: opts.log ?? botLog(),
    api: opts.api ?? api(),
    games: async () => [
      { heroId: 14, startedAt: new Date("2026-10-13T10:00:00Z"), won: true, ranked: true },
    ],
    heroes: async () => HEROES,
    isPlus: opts.isPlus ?? (async () => true),
    translator: (locale) => t(locale),
    enqueueRecap: opts.enqueue ?? (async () => {}),
    appUrl: "https://www.dota-den.com",
    logger: { warn: vi.fn(), info: vi.fn() },
    now: () => NOW,
  });
}

describe("DiscordServerService", () => {
  const job = { guildId: GUILD, week: "2026-10-12" };

  it("queues one recap per server that wants one and hasn't had this week's", async () => {
    const enqueue = vi.fn(async () => {});
    const store = guilds([
      { ...RECAP_GUILD },
      { ...RECAP_GUILD, guildId: "3".repeat(18), lastRecapWeek: "2026-10-12" },
      { ...RECAP_GUILD, guildId: "4".repeat(18), recap: false },
    ]);
    expect(await server({ guildStore: store, enqueue }).runRecapSchedule()).toMatchObject({
      week: "2026-10-12",
      queued: 1,
    });
    expect(enqueue).toHaveBeenCalledWith(job);
    // Without the bot token nothing is queued.
    expect(await server({ api: api(false), enqueue }).runRecapSchedule()).toMatchObject({
      off: true,
    });
  });

  it("posts only opted-in members, once, in the server's language", async () => {
    const store = links([
      { ...ANA, guilds: [GUILD], recapGuilds: [GUILD] },
      { ...ANA, discordId: "7".repeat(18), userId: "u2", username: "ben", globalName: null },
    ]);
    const out = api();
    const log = botLog();
    const guildStore = guilds([{ ...RECAP_GUILD }]);
    const svc = server({ store, api: out, log, guildStore });
    expect(await svc.postRecap(job)).toBe("posted");
    expect(out.sent).toHaveLength(1);
    const embed = out.sent[0].message.embeds![0] as { description: string; title: string };
    expect(embed.title).toMatch(/^fil:/);
    expect(embed.description).toContain("Ana\\_\\*");
    expect(embed.description).not.toContain("ben");
    expect(out.sent[0].message.allowed_mentions).toEqual({ parse: [] });
    // A retried job posts nothing more.
    expect(await svc.postRecap(job)).toBe("already_posted");
    expect(out.sent).toHaveLength(1);
  });

  it("stops while the person who turned it on has no Plus, and refuses bad payloads", async () => {
    const out = api();
    expect(await server({ api: out, isPlus: async () => false }).postRecap(job)).toBe("not_plus");
    expect(await server({ api: out }).postRecap({ guildId: GUILD, week: "2026-10-26" })).toBe(
      "invalid",
    );
    expect(await server({ api: out }).postRecap({ guildId: "x", week: "2026-10-12" })).toBe(
      "invalid",
    );
    expect(out.sent).toEqual([]);
  });

  it("retries when Discord is busy, and gives up when it may not post", async () => {
    const store = links([{ ...ANA, guilds: [GUILD], recapGuilds: [GUILD] }]);
    const busy = api();
    busy.answer = () => ({ kind: "rate_limited", retryAfterMs: 1000 });
    const log = botLog();
    await expect(server({ store, api: busy, log }).postRecap(job)).rejects.toThrow();
    expect(log.claimed.size).toBe(0);
    const blocked = api();
    blocked.answer = () => ({ kind: "forbidden", status: 403 });
    expect(await server({ store, api: blocked, log }).postRecap(job)).toBe("cant_post");
    expect(log.claimed.size).toBe(1);
  });

  it("sends a nudge once, only where the member asked", async () => {
    const out = api();
    const store = links([{ ...ANA, nudges: { where: "dm", guildId: null } }]);
    const svc = server({ store, api: out });
    const nudge = {
      kind: "stop_loss" as const,
      occasion: "s1:losses",
      title: "Stop-loss",
      body: "Good time to stop.",
      url: "/dashboard",
    };
    expect(await svc.nudge("u1", nudge)).toBe(1);
    expect(await svc.nudge("u1", nudge)).toBe(0);
    expect(out.sent.map((s) => s.to)).toEqual([`dm:${ANA.discordId}`]);
    // Someone who never opted in gets nothing.
    expect(await server({ api: out }).nudge("u1", { ...nudge, occasion: "s2" })).toBe(0);
    expect(out.sent).toHaveLength(1);
  });
});

describe("AppBotFeatures (the site's services, shared quotas)", () => {
  const base = {
    games: async () => [],
    latestMatchId: async () => "8000000001",
    heroes: async () => HEROES,
    userLanguage: async () => null,
    setLanguage: async () => {},
    isPlus: async () => true,
    coachEnabled: () => true,
    coachReview: vi.fn(),
    askEnabled: () => true,
    ask: vi.fn(),
    pick: vi.fn(),
    logger: { warn: vi.fn() },
  };
  const user = { id: "u1", accountId32: 7 };

  it("Ask Den's daily allowance refusal becomes the quota reply", async () => {
    const ask = vi.fn(async () => {
      throw new AppError("rate_limited", "You've used today's questions.", {
        reason: "quota",
        quota: { resetsAt: "2026-10-25T16:00:00.000Z" },
      });
    });
    const f = new AppBotFeatures({ ...base, ask });
    expect(await f.ask(user, "hi", "fil")).toEqual({
      kind: "quota",
      resetsAt: "2026-10-25T16:00:00.000Z",
    });
    expect(ask).toHaveBeenCalledWith(user, "hi", "fil");
  });

  it("the coach reviews the latest match by default and explains an unparsed replay", async () => {
    const coachReview = vi.fn(async () => {
      throw new AppError("conflict", "needs parse", { reason: "unparsed" });
    });
    const f = new AppBotFeatures({ ...base, coachReview });
    expect(await f.coach(user, null, "en")).toEqual({ kind: "unparsed", matchId: "8000000001" });
    expect(coachReview).toHaveBeenCalledWith(user, "8000000001", "en");
    expect(
      await new AppBotFeatures({ ...base, latestMatchId: async () => null }).coach(
        user,
        null,
        "en",
      ),
    ).toEqual({ kind: "no_match" });
    expect(
      await new AppBotFeatures({ ...base, coachEnabled: () => false }).coach(user, null, "en"),
    ).toEqual({ kind: "off" });
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
    expect(await svc.status("u1")).toEqual({
      enabled: false,
      linked: null,
      inviteUrl: null,
      canNudge: false,
    });
  });

  it("turns DM nudges on only when the bot can send them", async () => {
    const store = links();
    await expect(
      new DiscordLinkService({ oauth, links: store }).setNudges("u1", "dm"),
    ).rejects.toThrow();
    const svc = new DiscordLinkService({ oauth, links: store, canNudge: true });
    expect((await svc.setNudges("u1", "dm")).linked?.nudges).toBe("dm");
    expect((await svc.setNudges("u1", "off")).linked?.nudges).toBe("off");
    await expect(svc.setNudges("nobody", "dm")).rejects.toThrow();
  });
});
