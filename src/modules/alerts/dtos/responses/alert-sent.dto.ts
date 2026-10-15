import type { WebhookOutcome } from "../../alerts.model";

/** Where an alert went: how many admin devices got the push, and the Discord post. */
export interface AlertSentDto {
  devices: number;
  webhook: WebhookOutcome;
}
