/** Public API of the email feature (weekly email digest, ADR 0011). */
export {
  emailController,
  emailDigest,
  emailEnabled,
  emailLogRepository,
  emailService,
  emailSubscriptionsRepository,
  emailWebhookEventsRepository,
  emailWebhooks,
} from "./email.container";
export type {
  DigestRunDto,
  EmailStatusDto,
  TokenOutcomeDto,
  WebhookOutcomeDto,
} from "./dtos/responses/email-status.dto";
