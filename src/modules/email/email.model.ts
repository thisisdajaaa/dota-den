export const EMAIL_COLLECTIONS = {
  subscriptions: "email_subscriptions",
  log: "email_log",
} as const;

/** pending: waiting for the confirmation link. Only confirmed addresses get the digest. */
export type EmailSubscriptionStatus = "pending" | "confirmed" | "unsubscribed";

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
