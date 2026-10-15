import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator, type Translator } from "@/common/i18n/translate";
import type { Logger } from "@/common/logging/logger";
import { ALERT_THROTTLE_MS, type Alert } from "../domain/alert-rules";
import type { OwnerAlert, WebhookOutcome } from "../alerts.model";
import type {
  AdminRecipientsPort,
  AlertLogPort,
  AlertPushPort,
  AlertThrottlePort,
  AlertWebhookPort,
} from "../alerts.ports";
import type { AlertSentDto } from "../dtos/responses/alert-sent.dto";

const english: Translator<Messages> = translator<Messages>(englishMessages, englishMessages);

/** Title and body of an alert in one language. */
export function alertText(t: Translator<Messages>, alert: Pick<Alert, "kind" | "vars">) {
  return {
    title: t(`admin.alerts.messages.${alert.kind}.title`, alert.vars),
    body: t(`admin.alerts.messages.${alert.kind}.body`, alert.vars),
  };
}

/**
 * Tells the owner something needs fixing: a push to every admin's devices (in their language)
 * and, when configured, a post to the owner's Discord channel. The same alert key goes out at
 * most once per ALERT_THROTTLE_MS. Every sent alert is logged for the admin page.
 */
export class OwnerAlertsService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      log: AlertLogPort;
      throttle: AlertThrottlePort;
      recipients: AdminRecipientsPort;
      push: AlertPushPort;
      /** Null when ADMIN_ALERT_WEBHOOK_URL isn't set. */
      webhook: AlertWebhookPort | null;
      logger: Pick<Logger, "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Raises an alert unless the same key was raised within the throttle window. */
  async raise(alert: Alert): Promise<AlertSentDto | null> {
    const now = this.now();
    const until = new Date(now.getTime() + ALERT_THROTTLE_MS);
    if (!(await this.deps.throttle.claim(alert.key, until, now))) return null;
    return this.send(alert, now);
  }

  /** "Send a test alert" on the admin page: never throttled. */
  sendTest(): Promise<AlertSentDto> {
    return this.send({ kind: "test", key: "test", vars: {} }, this.now());
  }

  recent(limit = 20): Promise<OwnerAlert[]> {
    return this.deps.log.recent(limit);
  }

  private async send(alert: Alert, now: Date): Promise<AlertSentDto> {
    const { push, webhook, recipients, logger } = this.deps;
    let devices = 0;
    if (push.enabled) {
      const admins = await recipients.admins().catch((error: unknown) => {
        logger.warn("owner_alert_recipients_failed", { error });
        return [];
      });
      const counts = await Promise.all(
        admins.map(async (admin) => {
          const locale = isLocale(admin.language) ? admin.language : DEFAULT_LOCALE;
          const t = translator<Messages>(MESSAGES[locale], englishMessages);
          return push
            .deliver(admin.id, {
              ...alertText(t, alert),
              url: "/admin#alerts",
              tag: `alert-${alert.kind}`,
            })
            .catch((error: unknown) => {
              logger.warn("owner_alert_push_failed", { kind: alert.kind, error });
              return 0;
            });
        }),
      );
      devices = counts.reduce((a, b) => a + b, 0);
    }
    const outcome: WebhookOutcome = webhook
      ? await webhook.post(alertText(english, alert)).catch(() => "failed" as const)
      : "off";
    await this.deps.log
      .insert({
        kind: alert.kind,
        key: alert.key,
        vars: alert.vars,
        at: now,
        devices,
        webhook: outcome,
      })
      .catch((error: unknown) => logger.warn("owner_alert_log_failed", { error }));
    // Also in the logs, so it shows up in Vercel even if nobody got it.
    logger.warn("owner_alert", { kind: alert.kind, key: alert.key, devices, webhook: outcome });
    return { devices, webhook: outcome };
  }
}
