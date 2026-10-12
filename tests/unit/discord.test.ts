import { describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UpstreamUnavailableError,
  ValidationError,
} from "@/common/errors/app-error";
import {
  maskWebhook,
  parseWebhookUrl,
  retryAfterMs,
  webhookUrl,
  type WebhookTarget,
} from "@/modules/discord/domain/discord-webhook";
import {
  chunk,
  feedWindowStart,
  formatDuration,
  LOSS_COLOR,
  MAX_MATCH_AGE_MS,
  WIN_COLOR,
  type DiscordMessage,
  type FeedMatch,
} from "@/modules/discord/domain/feed";
import type {
  DiscordClient,
  FeedUser,
  PostLogPort,
  PostOutcome,
  StoredFeed,
  WebhookInfoOutcome,
  WebhooksRepositoryPort,
} from "@/modules/discord/discord.ports";
import { DiscordWebhookClient } from "@/modules/discord/infrastructure/discord-webhook-client";
import { DiscordFeedService } from "@/modules/discord/services/discord-feed.service";
import { DiscordWebhookService } from "@/modules/discord/services/discord-webhook.service";

const ID = "123456789012345678";
const TOKEN = "a".repeat(34) + "B_c-".repeat(8) + "z";
const URL_OK = `https://discord.com/api/webhooks/${ID}/${TOKEN}`;
const HOUR = 3_600_000;

describe("webhook URLs", () => {
  it("accepts Discord's webhook URLs on each of its hosts", () => {
    for (const host of ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]) {
      expect(parseWebhookUrl(`https://${host}/api/webhooks/${ID}/${TOKEN}`)).toEqual({
        origin: `https://${host}`,
        id: ID,
        token: TOKEN,
      });
    }
    // Pasted with whitespace or a trailing slash; host case doesn't matter.
    expect(parseWebhookUrl(`  https://Discord.com/api/webhooks/${ID}/${TOKEN}/ `)).toMatchObject({
      origin: "https://discord.com",
    });
  });

  it("refuses anything else, since the server sends requests to it (SSRF)", () => {
    const path = `/api/webhooks/${ID}/${TOKEN}`;
    for (const bad of [
      `http://discord.com${path}`,
      `https://discord.com:8443${path}`,
      `https://evil.com${path}`,
      `https://discord.com.evil.com${path}`,
      `https://evildiscord.com${path}`,
      `https://cdn.discord.com${path}`,
      `https://127.0.0.1${path}`,
      `https://user:pass@discord.com${path}`,
      `https://discord.com${path}?wait=true`,
      `https://discord.com${path}#x`,
      `https://discord.com/api/v10/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}`,
      `https://discord.com/api/webhooks/abc/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}/short`,
      `https://discord.com/api/webhooks/${ID}/${TOKEN}/github`,
      `https://discord.com/api/webhooks/${ID}/${TOKEN}/../../users/@me`,
      `https://discord.com/api/webhooks/${ID}/${"x".repeat(300)}`,
      "discord.com/api/webhooks/1/2",
      "javascript:alert(1)",
      "",
    ]) {
      expect(parseWebhookUrl(bad), bad).toBeNull();
    }
  });

  it("allows a local test host (http, any port) only when asked to", () => {
    const local = `http://127.0.0.1:3301/api/webhooks/${ID}/${TOKEN}`;
    expect(parseWebhookUrl(local)).toBeNull();
    expect(parseWebhookUrl(local, { testHosts: ["127.0.0.1"] })).toEqual({
      origin: "http://127.0.0.1:3301",
      id: ID,
      token: TOKEN,
    });
    expect(
      parseWebhookUrl(`http://localhost:3301/api/webhooks/${ID}/${TOKEN}`, {
        testHosts: ["127.0.0.1"],
      }),
    ).toBeNull();
  });

  it("rebuilds the URL from its parts and masks the token for display", () => {
    const target = parseWebhookUrl(`${URL_OK}/`)!;
    expect(webhookUrl(target)).toBe(URL_OK);
    expect(maskWebhook(target)).toBe(`discord.com/api/webhooks/${ID}/••••••••`);
    expect(maskWebhook(target)).not.toContain(TOKEN.slice(0, 8));
  });

  it("reads how long Discord wants us to wait", () => {
    expect(retryAfterMs({ retry_after: 1.5 }, null)).toBe(1500);
    expect(retryAfterMs(null, "3")).toBe(3000);
    expect(retryAfterMs(null, null)).toBe(1000);
  });
});

describe("feed rules", () => {
  it("only looks at games after the feed was turned on, and from the last 3 days", () => {
    const now = new Date("2026-10-09T06:00:00Z");
    const recent = new Date(now.getTime() - HOUR);
    expect(feedWindowStart(recent, now)).toEqual(recent);
    expect(feedWindowStart(new Date("2026-01-01"), now).getTime()).toBe(
      now.getTime() - MAX_MATCH_AGE_MS,
    );
  });

  it("formats durations and splits batches", () => {
    expect(formatDuration(2045)).toBe("34:05");
    expect(formatDuration(3729)).toBe("1:02:09");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

// --- In-memory fakes -------------------------------------------------------------------------

const target: WebhookTarget = { origin: "https://discord.com", id: ID, token: TOKEN };
const SINCE = new Date("2026-10-08T00:00:00Z");
const NOW = new Date("2026-10-09T00:00:00Z");

function memoryWebhooks(feeds: StoredFeed[]): WebhooksRepositoryPort & { feeds: StoredFeed[] } {
  const find = (userId: string) => feeds.find((f) => f.userId === userId) ?? null;
  return {
    feeds,
    get: async (userId) => find(userId),
    byAccount: async (accountId32) => feeds.find((f) => f.accountId32 === accountId32) ?? null,
    active: async () => feeds.filter((f) => f.enabled && !f.gone),
    save: async (feed, now) => {
      const i = feeds.findIndex((f) => f.userId === feed.userId);
      const next = { ...feed, enabled: true, gone: false, since: now, lastPostedAt: null };
      if (i >= 0) feeds[i] = next;
      else feeds.push(next);
    },
    setEnabled: async (userId, enabled, now) => {
      const f = find(userId);
      if (!f || (enabled && f.gone)) return false;
      if (enabled && !f.enabled) f.since = now;
      f.enabled = enabled;
      return true;
    },
    markGone: async (userId) => {
      const f = find(userId)!;
      f.gone = true;
      f.enabled = false;
    },
    markPosted: async (userId, now) => {
      find(userId)!.lastPostedAt = now;
    },
    remove: async (userId) => {
      const i = feeds.findIndex((f) => f.userId === userId);
      if (i >= 0) feeds.splice(i, 1);
      return i >= 0;
    },
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
}

function memoryLog(): PostLogPort & { rows: Map<string, { startedAt: Date; sent: boolean }> } {
  const rows = new Map<string, { startedAt: Date; sent: boolean }>();
  return {
    rows,
    claim: async (userId, matchId, startedAt) => {
      const id = `${userId}:${matchId}`;
      if (rows.has(id)) return false;
      rows.set(id, { startedAt, sent: false });
      return true;
    },
    release: async (userId, ids) => {
      for (const m of ids) if (!rows.get(`${userId}:${m}`)?.sent) rows.delete(`${userId}:${m}`);
    },
    markSent: async (userId, ids) => {
      for (const m of ids) rows.get(`${userId}:${m}`)!.sent = true;
    },
    claimedSince: async (userId, from) =>
      [...rows.entries()]
        .filter(([id, r]) => id.startsWith(`${userId}:`) && r.startedAt >= from)
        .map(([id]) => id.split(":")[1]),
    exportForOwner: async () => [],
    deleteForOwner: async () => 0,
  };
}

function match(n: number, startedAt: Date, extra: Partial<FeedMatch> = {}): FeedMatch {
  return {
    matchId: String(8_000_000_000 + n),
    startedAt,
    durationSec: 2045,
    heroId: 1,
    result: "win",
    kills: 10,
    deaths: 2,
    assists: 7,
    ranked: true,
    queueClass: "unknown",
    partySize: null,
    mode: "All Pick",
    ...extra,
  };
}

function setup(opts: {
  matches: FeedMatch[];
  outcomes?: PostOutcome[];
  user?: Partial<FeedUser>;
  feeds?: StoredFeed[];
}) {
  const feeds = opts.feeds ?? [
    {
      userId: "u1",
      accountId32: 22202,
      target,
      name: "Den",
      channelId: "1",
      enabled: true,
      gone: false,
      since: SINCE,
      lastPostedAt: null,
    },
  ];
  const webhooks = memoryWebhooks(feeds);
  const log = memoryLog();
  const outcomes = [...(opts.outcomes ?? [])];
  const sent: DiscordMessage[] = [];
  const client: DiscordClient = {
    info: async () => ({ kind: "ok", name: "Den", channelId: "1" }),
    post: vi.fn(async (_t, message) => {
      const outcome = outcomes.shift() ?? { kind: "ok" as const };
      if (outcome.kind === "ok") sent.push(message);
      return outcome;
    }),
  };
  const startedAfter = vi.fn(
    async (
      _account: number,
      from: Date,
      o: { excludeMatchIds: readonly string[]; limit: number },
    ) =>
      opts.matches
        .filter((m) => m.startedAt > from && !o.excludeMatchIds.includes(m.matchId))
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        .slice(0, o.limit),
  );
  const service = new DiscordFeedService({
    webhooks,
    log,
    client,
    matches: { startedAfter },
    users: {
      byIds: async (ids) =>
        ids.map((id) => ({ id, language: null, name: "Fixture Hero", ...opts.user })),
    },
    heroes: {
      all: async () =>
        new Map([[1, { name: "Anti-Mage", imageUrl: "https://cdn.example/am.png" }]]),
    },
    appUrl: () => "https://dotaden.example/",
    logger: { warn: () => {}, info: () => {} },
    now: () => NOW,
  });
  return { service, webhooks, log, client, sent, startedAfter };
}

const after = (h: number) => new Date(SINCE.getTime() + h * HOUR);

describe("DiscordFeedService", () => {
  it("posts new matches once, as embeds with the real numbers and a link", async () => {
    const { service, sent, webhooks } = setup({
      matches: [
        match(1, after(1)),
        match(2, after(2), { result: "loss", queueClass: "party", partySize: 3, ranked: false }),
      ],
    });
    expect(await service.postNewFor(22202)).toEqual({ posted: 2, outcome: "posted" });
    expect(sent).toHaveLength(1);
    const [win, loss] = sent[0].embeds;
    expect(sent[0].allowed_mentions).toEqual({ parse: [] });
    expect(win).toMatchObject({
      title: "Win · Anti-Mage",
      url: "https://dotaden.example/matches/8000000001",
      color: WIN_COLOR,
      author: { name: "Fixture Hero" },
      thumbnail: { url: "https://cdn.example/am.png" },
      footer: { text: "Dota Den · Match 8000000001" },
    });
    expect(win.fields).toEqual([
      { name: "K / D / A", value: "10/2/7", inline: true },
      { name: "Duration", value: "34:05", inline: true },
      { name: "Mode", value: "All Pick · Ranked", inline: true },
      // Party size not recorded: Unknown, never solo.
      { name: "Queue", value: "Unknown", inline: true },
    ]);
    expect(loss).toMatchObject({ title: "Loss · Anti-Mage", color: LOSS_COLOR });
    expect(loss.fields?.[2].value).toBe("All Pick · Unranked");
    expect(loss.fields?.[3].value).toBe("Party of 3");
    expect(webhooks.feeds[0].lastPostedAt).toEqual(NOW);

    // The next sync finds nothing new: no duplicates.
    expect(await service.postNewFor(22202)).toEqual({ posted: 0, outcome: "nothing_new" });
    expect(sent).toHaveLength(1);
  });

  it("never posts games from before the feed was turned on", async () => {
    const { service, sent } = setup({
      matches: [match(1, new Date(SINCE.getTime() - HOUR)), match(2, SINCE)],
    });
    expect(await service.postNewFor(22202)).toEqual({ posted: 0, outcome: "nothing_new" });
    expect(sent).toHaveLength(0);
  });

  it("writes the post in the player's language and never invents a hero name", async () => {
    const { service, sent } = setup({
      matches: [match(1, after(1), { heroId: 999, mode: null, queueClass: "solo", partySize: 1 })],
      user: { language: "fil", name: null },
    });
    await service.postNewFor(22202);
    const [embed] = sent[0].embeds;
    expect(embed.title).toBe("Panalo · Hero #999");
    expect(embed.author).toBeUndefined();
    expect(embed.thumbnail).toBeUndefined();
    expect(embed.fields?.[2].value).toBe("Hindi alam ang mode · Ranked");
    expect(embed.fields?.[3].value).toBe("Solo");
  });

  it("caps a big import at 10 matches per run, oldest first; the rest go next run", async () => {
    const matches = Array.from({ length: 13 }, (_, i) => match(i + 1, after(i + 1)));
    const { service, sent } = setup({ matches });
    expect((await service.postNewFor(22202)).posted).toBe(10);
    expect(sent[0].embeds).toHaveLength(10);
    expect(sent[0].embeds[0].footer?.text).toContain("8000000001");
    expect((await service.postNewFor(22202)).posted).toBe(3);
    expect(sent[1].embeds.map((e) => e.footer?.text)).toEqual([
      "Dota Den · Match 8000000011",
      "Dota Den · Match 8000000012",
      "Dota Den · Match 8000000013",
    ]);
  });

  it("on 429 releases the claims and stops, so the next run posts them", async () => {
    const { service, sent, log } = setup({
      matches: [match(1, after(1))],
      outcomes: [{ kind: "rate_limited", retryAfterMs: 2000, global: false }],
    });
    expect(await service.postNewFor(22202)).toEqual({ posted: 0, outcome: "rate_limited" });
    expect(log.rows.size).toBe(0);
    expect(await service.postNewFor(22202)).toEqual({ posted: 1, outcome: "posted" });
    expect(sent).toHaveLength(1);
  });

  it("turns the feed off when Discord says the webhook was deleted (404/401)", async () => {
    const { service, webhooks } = setup({
      matches: [match(1, after(1))],
      outcomes: [{ kind: "gone" }],
    });
    expect(await service.postNewFor(22202)).toEqual({ posted: 0, outcome: "gone" });
    expect(webhooks.feeds[0]).toMatchObject({ gone: true, enabled: false });
    expect(await service.postNewFor(22202)).toEqual({ posted: 0, outcome: "off" });
  });

  it("does nothing for a player without a feed, or with it turned off", async () => {
    const { service, webhooks, startedAfter } = setup({ matches: [match(1, after(1))] });
    expect(await service.postNewFor(1)).toEqual({ posted: 0, outcome: "off" });
    webhooks.feeds[0].enabled = false;
    expect(await service.postNewFor(22202)).toEqual({ posted: 0, outcome: "off" });
    expect(startedAfter).not.toHaveBeenCalled();
  });

  it("runs every active feed, and stops the run on a global rate limit", async () => {
    const feed = (userId: string, accountId32: number): StoredFeed => ({
      userId,
      accountId32,
      target,
      name: null,
      channelId: null,
      enabled: true,
      gone: false,
      since: SINCE,
      lastPostedAt: null,
    });
    const ok = setup({
      matches: [match(1, after(1))],
      feeds: [feed("u1", 1), feed("u2", 2)],
    });
    expect(await ok.service.runAll({ budgetMs: 10_000 })).toEqual({
      feeds: 2,
      posted: 2,
      failed: 0,
      rateLimited: false,
      stoppedEarly: false,
    });
    const limited = setup({
      matches: [match(1, after(1))],
      feeds: [feed("u1", 1), feed("u2", 2)],
      outcomes: [{ kind: "rate_limited", retryAfterMs: 5000, global: true }],
    });
    expect(await limited.service.runAll({ budgetMs: 10_000 })).toMatchObject({
      feeds: 1,
      posted: 0,
      rateLimited: true,
      stoppedEarly: true,
    });
  });
});

describe("DiscordWebhookService", () => {
  const user = { id: "u1", accountId32: 22202, language: null, name: "Fixture Hero" };

  function make(info: WebhookInfoOutcome, post: PostOutcome = { kind: "ok" }) {
    const webhooks = memoryWebhooks([]);
    const client: DiscordClient = { info: async () => info, post: vi.fn(async () => post) };
    const service = new DiscordWebhookService({
      webhooks,
      log: memoryLog(),
      client,
      testMessage: () => ({ username: "Dota Den", embeds: [], allowed_mentions: { parse: [] } }),
      now: () => NOW,
    });
    return { service, webhooks, client };
  }

  it("saves a webhook Discord confirms, turned on, and never returns its token", async () => {
    const { service, webhooks } = make({ kind: "ok", name: "Den feed", channelId: "9" });
    const status = await service.connect(user, target);
    expect(status).toEqual({
      connected: true,
      enabled: true,
      gone: false,
      name: "Den feed",
      maskedUrl: `discord.com/api/webhooks/${ID}/••••••••`,
      lastPostedAt: null,
    });
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(webhooks.feeds[0]).toMatchObject({ since: NOW, accountId32: 22202 });
  });

  it("refuses a webhook Discord doesn't know, and says when Discord can't be reached", async () => {
    await expect(make({ kind: "gone" }).service.connect(user, target)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(make({ kind: "failed" }).service.connect(user, target)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("turns posting off and on; on again starts a new window", async () => {
    const { service, webhooks } = make({ kind: "ok", name: null, channelId: null });
    await expect(service.setEnabled("u1", false)).rejects.toBeInstanceOf(NotFoundError);
    await service.connect(user, target);
    webhooks.feeds[0].since = SINCE;
    expect((await service.setEnabled("u1", false)).enabled).toBe(false);
    expect((await service.setEnabled("u1", true)).enabled).toBe(true);
    expect(webhooks.feeds[0].since).toEqual(NOW);
  });

  it("a test post to a deleted webhook marks it gone and returns the new state", async () => {
    const { service, webhooks } = make(
      { kind: "ok", name: "Den", channelId: "1" },
      {
        kind: "gone",
      },
    );
    await service.connect(user, target);
    const error = await service.sendTest(user).catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 404, details: { status: { gone: true } } });
    expect(webhooks.feeds[0]).toMatchObject({ gone: true, enabled: false });
    await expect(service.setEnabled("u1", true)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.sendTest(user)).rejects.toBeInstanceOf(ConflictError);
  });

  it("passes on Discord's rate limit for a test post", async () => {
    const { service } = make(
      { kind: "ok", name: "Den", channelId: "1" },
      { kind: "rate_limited", retryAfterMs: 2500, global: false },
    );
    await service.connect(user, target);
    const error = await service.sendTest(user).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSec).toBe(3);
  });
});

describe("DiscordWebhookClient", () => {
  const respond = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
    vi.fn(
      async () =>
        new Response(body === undefined ? null : JSON.stringify(body), { status, headers }),
    );

  it("asks Discord about the webhook without following redirects", async () => {
    const fetchImpl = respond(200, { id: ID, name: "Den feed", channel_id: "42", token: TOKEN });
    const client = new DiscordWebhookClient(fetchImpl as unknown as typeof fetch);
    expect(await client.info(target)).toEqual({ kind: "ok", name: "Den feed", channelId: "42" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_OK);
    expect(init.redirect).toBe("manual");
  });

  it("treats another webhook's answer, 404 and 401 correctly", async () => {
    const other = new DiscordWebhookClient(respond(200, { id: "1" }) as unknown as typeof fetch);
    expect((await other.info(target)).kind).toBe("failed");
    for (const status of [404, 401]) {
      const c = new DiscordWebhookClient(respond(status, {}) as unknown as typeof fetch);
      expect(await c.info(target)).toEqual({ kind: "gone" });
      expect(
        await c.post(target, { username: "x", embeds: [], allowed_mentions: { parse: [] } }),
      ).toEqual({ kind: "gone" });
    }
  });

  it("maps a post's answer: sent, rate limited (with retry_after), or failed", async () => {
    const msg: DiscordMessage = { username: "x", embeds: [], allowed_mentions: { parse: [] } };
    const post = (status: number, body?: unknown, headers?: Record<string, string>) =>
      new DiscordWebhookClient(respond(status, body, headers) as unknown as typeof fetch).post(
        target,
        msg,
      );
    expect(await post(204)).toEqual({ kind: "ok" });
    expect(await post(429, { retry_after: 1.2, global: true })).toEqual({
      kind: "rate_limited",
      retryAfterMs: 1200,
      global: true,
    });
    expect(await post(429, undefined, { "retry-after": "2" })).toEqual({
      kind: "rate_limited",
      retryAfterMs: 2000,
      global: false,
    });
    expect(await post(500)).toEqual({ kind: "failed", status: 500 });
    const offline = new DiscordWebhookClient((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await offline.post(target, msg)).toEqual({ kind: "failed" });
  });
});
