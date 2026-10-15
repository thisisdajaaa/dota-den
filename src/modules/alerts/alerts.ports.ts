import type {
  AlertKind,
  CronFreshness,
  DownState,
  OpsJob,
  UpstreamHealth,
} from "./domain/alert-rules";
import type { OpsReport, OwnerAlert, WebhookOutcome } from "./alerts.model";

/** Sent alerts, for the admin page. */
export interface AlertLogPort {
  insert(alert: Omit<OwnerAlert, "id">): Promise<void>;
  recent(limit: number): Promise<OwnerAlert[]>;
}

/** At most one alert per key per window. Claiming is atomic across instances. */
export interface AlertThrottlePort {
  /** True when the key wasn't throttled (and now is, until `until`). */
  claim(key: string, until: Date, now: Date): Promise<boolean>;
}

export interface OpsReportsPort {
  insert(report: Omit<OpsReport, "id">): Promise<void>;
  recent(limit: number): Promise<OpsReport[]>;
}

/** Since when an upstream has looked down; null when it hasn't. */
export interface AlertStatePort {
  get(name: string): Promise<DownState | null>;
  set(name: string, state: DownState | null): Promise<void>;
}

/** The admins (users with the admin role) and the language each reads. */
export interface AdminRecipientsPort {
  admins(): Promise<Array<{ id: string; language: string | null }>>;
}

/** Push to every subscribed device of a user (notifications feature). */
export interface AlertPushPort {
  readonly enabled: boolean;
  /** How many devices received it. */
  deliver(
    userId: string,
    message: { title: string; body: string; url: string; tag: string },
  ): Promise<number>;
}

/** The owner's Discord channel (ADMIN_ALERT_WEBHOOK_URL). */
export interface AlertWebhookPort {
  post(message: { title: string; body: string }): Promise<Exclude<WebhookOutcome, "off">>;
}

/** When the daily jobs last completed (jobs feature). */
export interface CronHistoryPort {
  freshness(names: readonly string[]): Promise<CronFreshness>;
}

/** OpenDota as this instance sees it (provider gateway). */
export interface UpstreamHealthPort {
  openDota(): UpstreamHealth | null;
}

export type { AlertKind, OpsJob };
