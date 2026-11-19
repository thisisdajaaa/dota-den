import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { afterResponse } from "@/common/http/after-response";
import { rateLimit } from "@/common/http/rate-limit";
import { askService } from "@/modules/assistant";
import { pickForMeService } from "@/modules/drafts";
import { usersService } from "@/modules/identity";
import { jobsService } from "@/modules/jobs";
import { plusService } from "@/modules/plus";
import { matchCoachService, matchesService, matchQueries } from "@/modules/matches";
import { gameModeLabel } from "@/modules/matches/ui/format";
import { DiscordController } from "./discord.controller";
import type { BotGame, BotLocale } from "./domain/bot";
import { AppBotFeatures } from "./infrastructure/app-bot-features";
import { DiscordApi } from "./infrastructure/discord-api";
import { DiscordBotLogRepository } from "./repositories/discord-bot-log.repository";
import { DiscordGuildsRepository } from "./repositories/discord-guilds.repository";
import { DiscordServerService } from "./services/discord-server.service";
import { DiscordOAuth, verifyInteraction } from "./infrastructure/discord-oauth";
import { DiscordWebhookClient } from "./infrastructure/discord-webhook-client";
import { DiscordLinksRepository } from "./repositories/discord-links.repository";
import { DiscordPostLogRepository } from "./repositories/discord-post-log.repository";
import { DiscordWebhooksRepository } from "./repositories/discord-webhooks.repository";
import { DiscordBotService, type Translate } from "./services/discord-bot.service";
import { DiscordFeedService } from "./services/discord-feed.service";
import { DiscordLinkService } from "./services/discord-link.service";
import { DiscordWebhookService } from "./services/discord-webhook.service";
import { usageService } from "@/modules/usage";

export const discordWebhooksRepository = new DiscordWebhooksRepository(getDb);
export const discordPostLogRepository = new DiscordPostLogRepository(getDb);
const client = new DiscordWebhookClient();

export const discordFeedService = lazy(
  () =>
    new DiscordFeedService({
      webhooks: discordWebhooksRepository,
      log: discordPostLogRepository,
      client,
      matches: {
        startedAfter: async (accountId32, from, opts) =>
          (await matchQueries.startedAfter(accountId32, from, opts)).map((f) => ({
            matchId: f.matchId,
            startedAt: f.startedAt,
            durationSec: f.durationSec,
            heroId: f.heroId,
            result: f.result,
            kills: f.kills,
            deaths: f.deaths,
            assists: f.assists,
            ranked: f.ranked,
            queueClass: f.queueClass,
            partySize: f.partySize,
            mode: f.gameMode === null ? null : gameModeLabel(f.gameMode),
          })),
      },
      users: {
        byIds: async (ids) =>
          (await usersService.findByIds(ids)).map((u) => ({
            id: u.id,
            language: u.settings.language ?? null,
            name: u.persona?.name ?? null,
          })),
      },
      heroes: {
        all: async () =>
          new Map(
            [...(await matchesService.heroMap())].map(([id, h]) => [
              id,
              { name: h.name, imageUrl: h.imageUrl },
            ]),
          ),
      },
      appUrl: () => env().APP_URL,
      logger,
    }),
);

export const discordWebhookService = lazy(
  () =>
    new DiscordWebhookService({
      webhooks: discordWebhooksRepository,
      log: discordPostLogRepository,
      client,
      testMessage: (user) => discordFeedService.testMessage(user),
    }),
);

export const discordLinksRepository = new DiscordLinksRepository(getDb);
export const discordGuildsRepository = new DiscordGuildsRepository(getDb);
export const discordBotLogRepository = new DiscordBotLogRepository(getDb);

/** Bot posts and DMs need the bot token; follow-ups to interactions don't. */
const discordApi = lazy(() => {
  const e = env();
  return new DiscordApi({ botToken: e.DISCORD_BOT_TOKEN ?? null, baseUrl: e.DISCORD_API_BASE_URL });
});

/** View Channel, Send Messages, Embed Links: all the bot needs in a server. */
const BOT_PERMISSIONS = String(1024 + 2048 + 16384);

function inviteUrl(): string | null {
  const { DISCORD_CLIENT_ID, DISCORD_PUBLIC_KEY } = env();
  if (!DISCORD_CLIENT_ID || !DISCORD_PUBLIC_KEY) return null;
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("client_id", DISCORD_CLIENT_ID);
  u.searchParams.set("scope", "bot applications.commands");
  u.searchParams.set("permissions", BOT_PERMISSIONS);
  return u.toString();
}

/** "Connect Discord": off until DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set. */
export const discordLinkService = lazy(() => {
  const e = env();
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, APP_URL } = e;
  return new DiscordLinkService({
    oauth:
      DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET
        ? new DiscordOAuth({
            clientId: DISCORD_CLIENT_ID,
            clientSecret: DISCORD_CLIENT_SECRET,
            redirectUri: `${APP_URL.replace(/\/$/, "")}/api/v1/discord/callback`,
            apiBaseUrl: e.DISCORD_API_BASE_URL,
            authorizeUrl: e.DISCORD_AUTHORIZE_URL,
          })
        : null,
    links: discordLinksRepository,
    inviteUrl: inviteUrl(),
    canNudge: Boolean(e.DISCORD_BOT_TOKEN && e.DISCORD_PUBLIC_KEY),
  });
});

const translate = (locale: BotLocale) =>
  translator<Messages>(MESSAGES[locale], englishMessages) as Translate;

const botGames = async (accountId32: number): Promise<BotGame[]> =>
  (await matchQueries.heroFacts(accountId32)).map((f) => ({
    heroId: f.heroId,
    startedAt: f.startedAt,
    won: f.result === "win",
    ranked: f.ranked,
  }));

const botHeroes = async () =>
  [...(await matchesService.heroMap()).values()].map((h) => ({ id: h.id, name: h.name }));

/** What the bot reads from other features: the site's own services, so quotas are shared. */
const botFeatures = new AppBotFeatures({
  games: botGames,
  latestMatchId: async (accountId32) => {
    const facts = await matchQueries.heroFacts(accountId32);
    let latest: (typeof facts)[number] | null = null;
    for (const f of facts) if (!latest || f.startedAt > latest.startedAt) latest = f;
    return latest?.matchId ?? null;
  },
  heroes: botHeroes,
  userLanguage: async (userId) =>
    (await usersService.findByIds([userId]))[0]?.settings.language ?? null,
  setLanguage: async (userId, locale) => {
    await usersService.setLanguage(userId, locale);
  },
  isPlus: (userId) => plusService.isPlus(userId),
  coachEnabled: () => matchCoachService.enabled,
  coachReview: (user, matchId, locale) => matchCoachService.review(user, matchId, locale),
  askEnabled: () => askService.enabled,
  ask: async (user, question, locale) => {
    const owner = { userId: user.id, accountId32: user.accountId32 };
    // The same daily allowance as /ask: a question asked here counts there too.
    const ticket = await askService.reserve(owner);
    return askService.answer(ticket, { question }, locale);
  },
  pick: (user, req) => pickForMeService.suggest(user, req),
  logger,
});

/** The Dota Den bot's slash commands (answered when DISCORD_PUBLIC_KEY is set). */
export const discordBotService = lazy(
  () =>
    new DiscordBotService({
      links: discordLinksRepository,
      guilds: discordGuildsRepository,
      features: botFeatures,
      api: discordApi,
      translator: translate,
      limit: (key, limit, windowMs) => rateLimit(key, limit, windowMs),
      appUrl: env().APP_URL.replace(/\/$/, ""),
      used: (userId) => usageService.record("discord_command", userId),
      logger,
    }),
);

/** The Monday server recap and members' nudges (need DISCORD_BOT_TOKEN). */
export const discordServerService = lazy(
  (): DiscordServerService =>
    new DiscordServerService({
      links: discordLinksRepository,
      guilds: discordGuildsRepository,
      log: discordBotLogRepository,
      api: discordApi,
      games: botGames,
      heroes: botHeroes,
      isPlus: (userId) => plusService.isPlus(userId),
      translator: translate,
      enqueueRecap: (job): Promise<void> => jobsService.enqueueDiscordRecap(job),
      appUrl: env().APP_URL.replace(/\/$/, ""),
      used: (feature, userId) => usageService.record(feature, userId),
      logger,
    }),
);

export const discordController = new DiscordController({
  service: discordWebhookService,
  links: () => discordLinkService,
  bot: () => discordBotService,
  publicKey: () => env().DISCORD_PUBLIC_KEY ?? null,
  verify: verifyInteraction,
  secureCookies: () => env().APP_URL.startsWith("https://"),
  defer: (task) => afterResponse("discord_followup", task),
  // E2E runs point the webhook at a local fake Discord (never in production).
  testHosts: () => {
    const { AUTH_TEST_MODE, NODE_ENV } = env();
    return AUTH_TEST_MODE && NODE_ENV !== "production" ? ["127.0.0.1"] : [];
  },
});
