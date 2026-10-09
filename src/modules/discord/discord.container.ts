import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { usersService } from "@/modules/identity";
import { matchesService, matchQueries } from "@/modules/matches";
import { gameModeLabel } from "@/modules/matches/ui/format";
import { DiscordController } from "./discord.controller";
import { DiscordWebhookClient } from "./infrastructure/discord-webhook-client";
import { DiscordPostLogRepository } from "./repositories/discord-post-log.repository";
import { DiscordWebhooksRepository } from "./repositories/discord-webhooks.repository";
import { DiscordFeedService } from "./services/discord-feed.service";
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

export const discordController = new DiscordController({
  service: discordWebhookService,
  // E2E runs point the webhook at a local fake Discord (never in production).
  testHosts: () => {
    const { AUTH_TEST_MODE, NODE_ENV } = env();
    return AUTH_TEST_MODE && NODE_ENV !== "production" ? ["127.0.0.1"] : [];
  },
});
