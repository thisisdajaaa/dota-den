import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { usersService } from "@/modules/identity";
import { matchesService, matchQueries } from "@/modules/matches";
import { gameModeLabel } from "@/modules/matches/ui/format";
import { DiscordController } from "./discord.controller";
import { DiscordOAuth, verifyInteraction } from "./infrastructure/discord-oauth";
import { DiscordWebhookClient } from "./infrastructure/discord-webhook-client";
import { DiscordLinksRepository } from "./repositories/discord-links.repository";
import { DiscordPostLogRepository } from "./repositories/discord-post-log.repository";
import { DiscordWebhooksRepository } from "./repositories/discord-webhooks.repository";
import { DiscordBotService } from "./services/discord-bot.service";
import { DiscordFeedService } from "./services/discord-feed.service";
import { DiscordLinkService } from "./services/discord-link.service";
import { DiscordWebhookService } from "./services/discord-webhook.service";

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

/** "Connect Discord": off until DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set. */
export const discordLinkService = lazy(() => {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, APP_URL } = env();
  return new DiscordLinkService({
    oauth:
      DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET
        ? new DiscordOAuth({
            clientId: DISCORD_CLIENT_ID,
            clientSecret: DISCORD_CLIENT_SECRET,
            redirectUri: `${APP_URL.replace(/\/$/, "")}/api/v1/discord/callback`,
          })
        : null,
    links: discordLinksRepository,
  });
});

/** The Dota Den bot's slash commands (answered when DISCORD_PUBLIC_KEY is set). */
export const discordBotService = lazy(
  () =>
    new DiscordBotService({
      links: discordLinksRepository,
      games: async (accountId32) =>
        (await matchQueries.heroFacts(accountId32)).map((f) => ({
          heroId: f.heroId,
          startedAt: f.startedAt,
          won: f.result === "win",
          ranked: f.ranked,
        })),
      heroName: async (id) => (await matchesService.heroMap()).get(id)?.name ?? `Hero #${id}`,
      translator: async (userId) => {
        const [user] = userId ? await usersService.findByIds([userId]) : [];
        const language = user?.settings.language;
        return translator<Messages>(
          MESSAGES[isLocale(language) ? language : DEFAULT_LOCALE],
          englishMessages,
        ) as (key: string, vars?: Record<string, string | number>) => string;
      },
      appUrl: env().APP_URL.replace(/\/$/, ""),
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
  // E2E runs point the webhook at a local fake Discord (never in production).
  testHosts: () => {
    const { AUTH_TEST_MODE, NODE_ENV } = env();
    return AUTH_TEST_MODE && NODE_ENV !== "production" ? ["127.0.0.1"] : [];
  },
});
