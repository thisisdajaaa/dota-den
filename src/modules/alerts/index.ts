/** Public API of the owner alerts feature (ADR 0009). */
export {
  alertLogRepository,
  alertsController,
  alertThrottleRepository,
  opsMonitor,
  opsReportsRepository,
  ownerAlerts,
} from "./alerts.container";
export type { OpsReport, OwnerAlert, WebhookOutcome } from "./alerts.model";
export type { AlertSentDto } from "./dtos/responses/alert-sent.dto";
export type { OpsReportResultDto } from "./dtos/responses/ops-report.dto";
