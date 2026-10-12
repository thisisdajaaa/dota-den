import type { EmailSubscriptionStatus } from "../../email.model";

/** The account page's weekly email section. */
export interface EmailStatusDto {
  /** False when the server has no email provider: the section says email isn't available. */
  enabled: boolean;
  /** The player's own address (shown only to them). */
  email: string | null;
  status: EmailSubscriptionStatus | "none";
}

export interface DigestRunDto {
  users: number;
  sent: number;
  /** No games last week, not Monday for them yet, or already sent. */
  skipped: number;
  failed: number;
  stoppedEarly: boolean;
}

/** What a confirmation or unsubscribe link did. */
export type TokenOutcomeDto = { outcome: "confirmed" | "unsubscribed" | "invalid" | "stale" };
