import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { usersService } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { mmrInsightsService } from "@/modules/mmr";
import { patchesService } from "@/modules/patches";
import { sessionService } from "@/modules/sessions";
import { PUSH_SERVICE_HOSTS } from "./domain/notification";
import { WebPushSender } from "./infrastructure/web-push-sender";
import { NotificationsController } from "./notifications.controller";
import { NotificationLogRepository } from "./repositories/notification-log.repository";
import { NotificationSettingsRepository } from "./repositories/notification-settings.repository";
import { PushSubscriptionsRepository } from "./repositories/push-subscriptions.repository";
import { NotificationService } from "./services/notification.service";
import { NotificationTriggersService } from "./services/notification-triggers.service";

export const pushSubscriptionsRepository = new PushSubscriptionsRepository(getDb);
export const notificationSettingsRepository = new NotificationSettingsRepository(getDb);
export const notificationLogRepository = new NotificationLogRepository(getDb);

/** The VAPID public key for the browser, or null when notifications are off. */
export function vapidPublicKey(): string | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = env();
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY ? VAPID_PUBLIC_KEY : null;
}

function sender(): WebPushSender | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, APP_URL } = env();
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  return new WebPushSender({
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
    subject: VAPID_SUBJECT ?? new URL(APP_URL).origin,
  });
}

export const notificationService = lazy(
  () =>
    new NotificationService({
      subscriptions: pushSubscriptionsRepository,
      settings: notificationSettingsRepository,
      log: notificationLogRepository,
      sender: sender(),
    }),
);

export const notificationTriggers = lazy(
  () =>
    new NotificationTriggersService({
      notifications: notificationService,
      users: {
        byIds: async (ids) =>
          (await usersService.findByIds(ids)).map((u) => ({
            id: u.id,
            accountId32: u.accountId32,
            language: u.settings.language ?? null,
            timeZone: u.settings.timeZone,
          })),
      },
      sessions: {
        latest: async (owner) => {
          const [view, gapMinutes] = await Promise.all([
            sessionService.latest(owner),
            sessionService.gap(owner),
          ]);
          if (!view) return null;
          const { session } = view;
          return {
            id: session.id,
            endedAt: session.endedAt,
            gapMinutes,
            games: session.stats.games,
            wins: session.stats.wins,
            heroIds: session.stats.heroes.map((h) => h.heroId),
          };
        },
      },
      weekly: {
        lastWeek: async (owner, timeZone) => {
          const { lastWeek } = await mmrInsightsService.weeklyRecap(owner, timeZone);
          return { games: lastWeek.games, wins: lastWeek.wins, losses: lastWeek.losses };
        },
      },
      patches: {
        digest: async (owner) => {
          const digest = await patchesService.latestDigest(
            { id: owner.userId, accountId32: owner.accountId32 },
            new Date(),
          );
          return digest
            ? {
                version: digest.version,
                publishedAt: digest.publishedAt,
                heroIds: digest.heroes.map((h) => h.heroId),
              }
            : null;
        },
      },
      heroes: {
        names: async () =>
          new Map([...(await matchesService.heroMap())].map(([id, h]) => [id, h.name])),
      },
      logger,
    }),
);

export const notificationsController = new NotificationsController({
  service: notificationService,
  testMessage: (language) => notificationTriggers.testMessage(language),
  // E2E tests subscribe a local address that nothing listens on (never in production).
  pushHosts: () => {
    const { AUTH_TEST_MODE, NODE_ENV } = env();
    return AUTH_TEST_MODE && NODE_ENV !== "production"
      ? [...PUSH_SERVICE_HOSTS, "127.0.0.1"]
      : PUSH_SERVICE_HOSTS;
  },
});
