import type { BillingProviderName, Subscription } from "./domain/subscription";

export const PLUS_SCHEMA_VERSION = 1;

export const PLUS_COLLECTIONS = {
  subscriptions: "plus_subscriptions",
  webhookEvents: "billing_webhook_events",
} as const;

/**
 * One subscription at the payment provider, as its latest webhook described it. No names,
 * emails or card details: the provider keeps those.
 */
export interface SubscriptionDocument extends Omit<Subscription, "subscriptionId"> {
  /** `${provider}:${subscriptionId}` */
  _id: string;
  subscriptionId: string;
  schemaVersion: number;
}

export type WebhookEventOutcome =
  "processing" | "applied" | "stale" | "unlinked" | "ignored" | "mode_mismatch";

/**
 * A webhook event we received: inserting its id is the claim, so a retried or replayed
 * delivery is handled once. Only routing facts are kept, never the payload.
 */
export interface WebhookEventDocument {
  /** `${provider}:${sha256(body)}` */
  _id: string;
  provider: BillingProviderName;
  eventName: string;
  subscriptionId: string | null;
  userId: string | null;
  outcome: WebhookEventOutcome;
  receivedAt: Date;
  /** When the current delivery started handling it (older events: `receivedAt`). */
  claimedAt?: Date;
  schemaVersion: number;
}
