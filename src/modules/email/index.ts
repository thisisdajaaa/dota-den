/** Public API of the email feature (weekly email digest, ADR 0011). */
export {
  emailController,
  emailDigest,
  emailEnabled,
  emailLogRepository,
  emailService,
  emailSubscriptionsRepository,
} from "./email.container";
export type {
  DigestRunDto,
  EmailStatusDto,
  TokenOutcomeDto,
} from "./dtos/responses/email-status.dto";
