import type { Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DISCORD_COLLECTIONS } from "@/modules/discord/discord.model";
import type { DiscordClient } from "@/modules/discord/discord.ports";
import type { WebhookTarget } from "@/modules/discord/domain/discord-webhook";
import type { DiscordMessage } from "@/modules/discord/domain/feed";
import { DiscordPostLogRepository } from "@/modules/discord/repositories/discord-post-log.repository";
import { DiscordWebhooksRepository } from "@/modules/discord/repositories/discord-webhooks.repository";
import { DiscordFeedService } from "@/modules/discord/services/discord-feed.service";
import { DiscordWebhookService } from "@/modules/discord/services/discord-webhook.service";
import {
  MatchFactsRepository,
  MatchReadRepository,
} from "@/modules/matches/repositories/matches.repository";
import { toFact } from "@/modules/matches/services/match-sync.service";
import { DiscordBotLogRepository } from "@/modules/discord/repositories/discord-bot-log.repository";
import { DiscordGuildsRepository } from "@/modules/discord/repositories/discord-guilds.repository";
import { DiscordLinksRepository } from "@/modules/discord/repositories/discord-links.repository";
import { createTestDb } from "../support/mongo";

let db: Db;
let teardown: () => Promise<void>;
let webhooks: DiscordWebhooksRepository;
let log: DiscordPostLogRepository;
const TOKEN = "t".repeat(68);
const target: WebhookTarget = {
  origin: "https://discord.com",
  id: "123456789012345678",
  token: TOKEN,
};
const owner = { userId: "u1", accountId32: 4242 };
const T0 = new Date("2026-10-08T00:00:00Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

beforeAll(async () => {
  ({ db, teardown } = await createTestDb());
  webhooks = new DiscordWebhooksRepository(async () => db);
  log = new DiscordPostLogRepository(async () => db);
  await webhooks.ensureIndexes();
  await log.ensureIndexes();
  await new MatchFactsRepository(async () => db).ensureIndexes();
});
afterAll(async () => teardown?.());

describe("DiscordWebhooksRepository", () => {
  it("keeps one webhook per player, found by account, turned on from when it was saved", async () => {
    await webhooks.save(
      { userId: "u1", accountId32: 4242, target, name: "Den", channelId: "9" },
      T0,
    );
    await webhooks.save(
      { userId: "u1", accountId32: 4242, target, name: "Den 2", channelId: "9" },
      hours(1),
    );
    expect(await db.collection(DISCORD_COLLECTIONS.webhooks).countDocuments()).toBe(1);
    expect(await webhooks.byAccount(4242)).toMatchObject({
      userId: "u1",
      name: "Den 2",
      enabled: true,
      gone: false,
      since: hours(1),
      target,
    });
    expect((await webhooks.active()).map((f) => f.userId)).toEqual(["u1"]);
  });

  it("turning on again starts a new window; a deleted webhook can't be turned on", async () => {
    expect(await webhooks.setEnabled("u1", true, hours(2))).toBe(true);
    expect((await webhooks.get("u1"))?.since).toEqual(hours(1)); // already on: unchanged
    await webhooks.setEnabled("u1", false, hours(3));
    expect(await webhooks.active()).toEqual([]);
    await webhooks.setEnabled("u1", true, hours(4));
    expect((await webhooks.get("u1"))?.since).toEqual(hours(4));
    await webhooks.markGone("u1", hours(5));
    expect(await webhooks.setEnabled("u1", true, hours(6))).toBe(false);
    expect(await webhooks.get("u1")).toMatchObject({ gone: true, enabled: false });
  });

  it("exports the webhook without its token and deletes it", async () => {
    const exported = await webhooks.exportForOwner(owner);
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ id: "u1", name: "Den 2", webhookId: target.id });
    expect(exported[0]).not.toHaveProperty("token");
    expect(JSON.stringify(exported)).not.toContain(TOKEN);
    expect(await webhooks.deleteForOwner(owner)).toBe(1);
    expect(await webhooks.get("u1")).toBeNull();
  });
});

describe("DiscordPostLogRepository", () => {
  it("claims each match once; releasing only frees unsent claims", async () => {
    expect(await log.claim("u2", "m1", hours(1), T0)).toBe(true);
    expect(await log.claim("u2", "m1", hours(1), T0)).toBe(false);
    expect(await log.claim("u2", "m2", hours(2), T0)).toBe(true);
    await log.markSent("u2", ["m1"], T0);
    await log.release("u2", ["m1", "m2"]);
    expect(await log.claimedSince("u2", hours(0))).toEqual(["m1"]);
    expect(await log.claimedSince("u2", hours(2))).toEqual([]);
    expect(await log.claim("u2", "m2", hours(2), T0)).toBe(true);
  });

  it("expires entries and is removed with the account", async () => {
    const indexes = await db.collection(DISCORD_COLLECTIONS.log).indexes();
    expect(indexes.find((i) => i.name === "ttl")?.expireAfterSeconds).toBe(90 * 24 * 3600);
    expect(await log.exportForOwner({ userId: "u2", accountId32: 1 })).toHaveLength(2);
    expect(await log.deleteForOwner({ userId: "u2", accountId32: 1 })).toBe(2);
  });
});

describe("Discord feed end to end (database, fake Discord)", () => {
  it("posts new matches once, even when two runs overlap, and never older history", async () => {
    const facts = new MatchFactsRepository(async () => db);
    const fact = (matchId: string, startedAt: Date, partySize: number | null) =>
      toFact(
        {
          accountId32: 5151,
          matchId,
          startedAt,
          durationSec: 1900,
          heroId: 14,
          side: "radiant",
          result: "loss",
          kills: 3,
          deaths: 7,
          assists: 12,
          gameMode: 22,
          lobbyType: 7,
          role: null,
          partySize,
          averageRankTier: null,
          allyHeroIds: null,
          enemyHeroIds: null,
          provenance: { provider: "opendota", fetchedAt: T0, parseStatus: "unparsed" },
        },
        [],
      );
    await facts.upsertMany([
      fact("90", hours(-2), 1),
      fact("91", hours(2), null),
      fact("92", hours(3), 2),
    ]);

    const posted: string[][] = [];
    const client: DiscordClient = {
      info: async () => ({ kind: "ok", name: "Den", channelId: "1" }),
      post: vi.fn(async (_t: WebhookTarget, message: DiscordMessage) => {
        posted.push(message.embeds.map((e) => e.footer?.text ?? ""));
        return { kind: "ok" as const };
      }),
    };
    const settings = new DiscordWebhookService({
      webhooks,
      log,
      client,
      testMessage: () => ({ username: "Dota Den", embeds: [], allowed_mentions: { parse: [] } }),
      now: () => T0,
    });
    await settings.connect({ id: "u3", accountId32: 5151, language: "ceb", name: null }, target);

    const reads = new MatchReadRepository(async () => db);
    const feed = new DiscordFeedService({
      webhooks,
      log,
      client,
      matches: {
        startedAfter: async (account, from, opts) =>
          (await reads.startedAfter(account, from, opts)).map((f) => ({
            ...f,
            mode: f.gameMode === 22 ? "All Pick" : null,
          })),
      },
      users: { byIds: async (ids) => ids.map((id) => ({ id, language: "ceb", name: null })) },
      heroes: { all: async () => new Map([[14, { name: "Pudge", imageUrl: null }]]) },
      appUrl: () => "https://dotaden.example",
      logger: { warn: () => {}, info: () => {} },
      now: () => hours(4),
    });

    const results = await Promise.all([feed.postNewFor(5151), feed.runAll({ budgetMs: 5_000 })]);
    const total = results[0].posted + results[1].posted;
    expect(total).toBe(2);
    expect(posted.flat().sort()).toEqual(["Dota Den · Match 91", "Dota Den · Match 92"]);
    expect(await feed.postNewFor(5151)).toEqual({ posted: 0, outcome: "nothing_new" });

    // Data export: the webhook (no token) and what was posted.
    const exported = await settings.exportMyData({ userId: "u3", accountId32: 5151 });
    expect(JSON.stringify(exported)).not.toContain(TOKEN);
    expect(exported.discordPosts.map((p) => p.matchId).sort()).toEqual(["91", "92"]);
    expect(await settings.deleteMyData({ userId: "u3", accountId32: 5151 })).toEqual({
      discordWebhook: 1,
      discordPosts: 2,
    });
  });
});

describe("Discord bot storage (links, servers, posts)", () => {
  const GUILD = "222222222222222222";
  const ME = { userId: "link-u1", accountId32: 9001 };
  const identity = (discordId: string, userId: string, accountId32: number) => ({
    discordId,
    userId,
    accountId32,
    username: `user${discordId.slice(-2)}`,
    globalName: null,
    avatar: null,
  });

  it("one link per Dota Den user and per Discord user; relinking replaces the old one", async () => {
    const links = new DiscordLinksRepository(async () => db);
    await links.ensureIndexes();
    await links.link(identity("100000000000000011", ME.userId, ME.accountId32), T0);
    await links.link(identity("100000000000000012", ME.userId, ME.accountId32), hours(1));
    expect(await links.forDiscord("100000000000000011")).toBeNull();
    expect(await links.forUser(ME.userId)).toMatchObject({
      discordId: "100000000000000012",
      guilds: [],
      recapGuilds: [],
      nudges: null,
      linkedAt: hours(1),
    });
    // Another Dota Den account taking the same Discord account moves the link.
    await links.link(identity("100000000000000012", "link-u2", 9002), hours(2));
    expect(await links.forUser(ME.userId)).toBeNull();
    await links.link(identity("100000000000000012", ME.userId, ME.accountId32), hours(3));
  });

  it("recap and nudges are opt-in per member; leaving the recap keeps the member", async () => {
    const links = new DiscordLinksRepository(async () => db);
    const id = "100000000000000012";
    await links.rememberGuild(id, GUILD);
    expect(await links.recapMembers(GUILD, 10)).toEqual([]);
    await links.setRecap(id, GUILD, true);
    expect((await links.recapMembers(GUILD, 10)).map((l) => l.userId)).toEqual([ME.userId]);
    await links.setRecap(id, GUILD, false);
    expect(await links.recapMembers(GUILD, 10)).toEqual([]);
    expect((await links.inGuild(GUILD, 10)).map((l) => l.userId)).toEqual([ME.userId]);

    expect(await links.nudgeUserIds()).toEqual([]);
    expect(await links.setNudges(ME.userId, { where: "server", guildId: GUILD })).toBe(true);
    expect(await links.nudgeUserIds()).toEqual([ME.userId]);
    expect((await links.forUser(ME.userId))?.nudges).toEqual({ where: "server", guildId: GUILD });
    await links.setNudges(ME.userId, null);
    expect(await links.nudgeUserIds()).toEqual([]);
    expect(await links.setNudges("nobody", null)).toBe(false);
  });

  it("server settings: saved by an admin, listed for the recap, marked once posted", async () => {
    const guilds = new DiscordGuildsRepository(async () => db);
    await guilds.ensureIndexes();
    const settings = {
      guildId: GUILD,
      channelId: "444444444444444444",
      recap: true,
      nudges: false,
      language: "fil" as const,
      userId: ME.userId,
      setupByDiscordId: "100000000000000012",
    };
    await guilds.save(settings, T0);
    await guilds.save({ ...settings, guildId: "333333333333333333", recap: false }, T0);
    expect((await guilds.withRecap()).map((g) => g.guildId)).toEqual([GUILD]);
    await guilds.markRecapped(GUILD, "2026-10-05", hours(1));
    // Saving again keeps the last recap week.
    await guilds.save({ ...settings, nudges: true }, hours(2));
    expect(await guilds.get(GUILD)).toMatchObject({ nudges: true, lastRecapWeek: "2026-10-05" });
  });

  it("bot posts are claimed once; a released claim can be taken again; all of it goes with the account", async () => {
    const posts = new DiscordBotLogRepository(async () => db);
    await posts.ensureIndexes();
    const who = { userId: ME.userId, guildId: null };
    expect(await posts.claim("nudge:link-u1:stop_loss:s1", who, T0)).toBe(true);
    expect(await posts.claim("nudge:link-u1:stop_loss:s1", who, T0)).toBe(false);
    await posts.release("nudge:link-u1:stop_loss:s1");
    expect(await posts.claim("nudge:link-u1:stop_loss:s1", who, T0)).toBe(true);
    await posts.markSent("nudge:link-u1:stop_loss:s1", T0);
    await posts.release("nudge:link-u1:stop_loss:s1");
    expect(await posts.claim("nudge:link-u1:stop_loss:s1", who, T0)).toBe(false);

    const links = new DiscordLinksRepository(async () => db);
    const guilds = new DiscordGuildsRepository(async () => db);
    expect(await links.exportForOwner(ME)).toHaveLength(1);
    expect(await guilds.exportForOwner(ME)).toHaveLength(2);
    expect(await posts.exportForOwner(ME)).toHaveLength(1);
    expect(await links.deleteForOwner(ME)).toBe(1);
    expect(await guilds.deleteForOwner(ME)).toBe(2);
    expect(await posts.deleteForOwner(ME)).toBe(1);
  });
});
