import type { ObjectId } from "mongodb";
import type { AlertKind, OpsJob } from "./domain/alert-rules";

export const ALERTS_COLLECTIONS = {
  /** Every alert that was sent (after throttling), for the admin page. */
  log: "owner_alerts",
  /** One document per alert key while it is throttled; expires when the window ends. */
  throttle: "owner_alert_throttle",
  /** Outcomes of the backup and restore-drill workflows. */
  opsReports: "ops_reports",
  /** Small state kept between checks (since when OpenDota has looked down). */
  state: "owner_alert_state",
} as const;

/** Alerts are kept 30 days; backup and drill outcomes 90 days. */
export const ALERT_LOG_RETENTION_S = 30 * 24 * 3600;
export const OPS_REPORT_RETENTION_S = 90 * 24 * 3600;

/** How an alert went out. "off": no webhook configured. */
export type WebhookOutcome = "sent" | "failed" | "off";

export interface OwnerAlert {
  id: string;
  kind: AlertKind;
  key: string;
  vars: Record<string, string | number>;
  at: Date;
  /** Admin devices that received the push. */
  devices: number;
  webhook: WebhookOutcome;
}

export interface OwnerAlertDocument extends Omit<OwnerAlert, "id"> {
  _id: ObjectId;
}

export interface AlertThrottleDocument {
  /** The alert key. */
  _id: string;
  /** TTL: the key may be raised again after this. */
  until: Date;
}

export interface OpsReport {
  id: string;
  job: OpsJob;
  ok: boolean;
  details: string;
  /** The workflow run on GitHub, when the workflow sent it. */
  runUrl: string | null;
  at: Date;
}

export interface OpsReportDocument extends Omit<OpsReport, "id"> {
  _id: ObjectId;
}

export interface AlertStateDocument {
  /** e.g. "opendota". */
  _id: string;
  downSince: Date;
  lastDownAt: Date;
}
