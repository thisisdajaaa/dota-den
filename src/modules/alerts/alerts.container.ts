import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { openDotaGateway } from "@/common/providers/opendota";
import { lazy } from "@/common/utils/lazy";
import { parseWebhookUrl } from "@/modules/discord/domain/discord-webhook";
import { usersService } from "@/modules/identity";
import { cronRunsRepository } from "@/modules/jobs";
import { notificationService } from "@/modules/notifications";
import { AlertsController } from "./alerts.controller";
import { DiscordAlertWebhook } from "./infrastructure/discord-alert-webhook";
import { AlertLogRepository } from "./repositories/alert-log.repository";
import { AlertStateRepository } from "./repositories/alert-state.repository";
import { AlertThrottleRepository } from "./repositories/alert-throttle.repository";
import { OpsReportsRepository } from "./repositories/ops-reports.repository";
import { OpsMonitorService } from "./services/ops-monitor.service";
import { OwnerAlertsService } from "./services/owner-alerts.service";

export const alertLogRepository = new AlertLogRepository(getDb);
export const alertThrottleRepository = new AlertThrottleRepository(getDb);
export const opsReportsRepository = new OpsReportsRepository(getDb);
const alertStateRepository = new AlertStateRepository(getDb);

/** The owner's Discord channel, or null when ADMIN_ALERT_WEBHOOK_URL isn't set. */
function webhook(): DiscordAlertWebhook | null {
  const url = env().ADMIN_ALERT_WEBHOOK_URL;
  const target = url ? parseWebhookUrl(url) : null;
  return target ? new DiscordAlertWebhook(target) : null;
}

export const ownerAlerts = lazy(
  () =>
    new OwnerAlertsService({
      log: alertLogRepository,
      throttle: alertThrottleRepository,
      recipients: {
        admins: async () =>
          (await usersService.admins()).map((u) => ({
            id: u.id,
            language: u.settings.language ?? null,
          })),
      },
      push: {
        get enabled() {
          return notificationService.enabled;
        },
        deliver: (userId, message) => notificationService.deliver(userId, message),
      },
      webhook: webhook(),
      logger,
    }),
);

export const opsMonitor = lazy(
  () =>
    new OpsMonitorService({
      alerts: { raise: (alert) => ownerAlerts.raise(alert) },
      crons: { freshness: (names) => cronRunsRepository.freshness(names) },
      upstream: {
        openDota: () => {
          try {
            return openDotaGateway().health();
          } catch {
            return null;
          }
        },
      },
      state: alertStateRepository,
      reports: opsReportsRepository,
      logger,
    }),
);

export const alertsController = new AlertsController({ monitor: opsMonitor });
