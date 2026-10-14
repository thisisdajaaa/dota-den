export const EMAIL_COLLECTIONS = {
  subscriptions: "email_subscriptions",
  log: "email_log",
  webhookEvents: "email_webhook_events",
} as const;

/**
 * pending: waiting for the confirmation link. Only confirmed addresses get the digest.
 * bounced / complained: the provider reported a hard bounce or a spam complaint, so nothing
 * more is sent to the address until the player enters an address again (double opt-in again).
 */
export type EmailSubscriptionStatus =
  "pending" | "confirmed" | "unsubscribed" | "bounced" | "complained";

/** A player's weekly email address and consent. One per player. */
export interface EmailSubscriptionDocument {
  /** The user id. */
  _id: string;
  /** Normalised (trimmed, lower case). Personal data: never logged in full. */
  email: string;
  status: EmailSubscriptionStatus;
  /** SHA-256 of the pending confirmation token (never the token itself). */
  confirmTokenHash: string | null;
  confirmExpiresAt: Date | null;
  /** Confirmation emails sent in the last day (rate limit). */
  confirmSends: Date[];
  /** Binds unsubscribe links to this confirmed subscription; new on every confirmation. */
  unsubscribeNonce: string | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
  /** When a bounce or complaint stopped the address (absent on older documents). */
  stoppedAt?: Date | null;
}

/** One sent email, so the same week is never sent twice. */
export interface EmailLogDocument {
  /** `${userId}:${kind}:${key}` */
  _id: string;
  userId: string;
  kind: string;
  key: string;
  sentAt: Date;
  /** The provider's message id, once sent. */
  providerId: string | null;
}

export const emailLogId = (userId: string, kind: string, key: string) => `${userId}:${kind}:${key}`;

/** A provider webhook already handled (by its Svix message id), so a retry isn't handled twice. */
export interface EmailWebhookEventDocument {
  /** The `svix-id` header. */
  _id: string;
  /** The event type, e.g. "email.bounced". No addresses are stored here. */
  type: string;
  receivedAt: Date;
}
