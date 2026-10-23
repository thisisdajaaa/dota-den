/**
 * A Plus subscription as we store it (pure types and rules). The payment provider (merchant of
 * record) is the source of truth; we keep the latest state its signed webhooks told us, and
 * decide entitlements from that state only, on the server (ADR 0013).
 */
import type { Plan } from "./plans";

/** Lemon Squeezy's subscription statuses (also our provider-neutral vocabulary). */
export const SUBSCRIPTION_STATUSES = [
  "on_trial",
  "active",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const isSubscriptionStatus = (v: unknown): v is SubscriptionStatus =>
  typeof v === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(v);

export type BillingProviderName = "lemonsqueezy";

/** What one webhook says about a subscription (already verified and parsed). */
export interface SubscriptionSnapshot {
  provider: BillingProviderName;
  /** The provider's subscription id. */
  subscriptionId: string;
  /** Our user id from the checkout's custom data; null when the event didn't carry one. */
  userId: string | null;
  status: SubscriptionStatus;
  plan: Plan | null;
  variantId: string | null;
  customerId: string | null;
  renewsAt: Date | null;
  endsAt: Date | null;
  trialEndsAt: Date | null;
  /** The provider's `updated_at`: orders events that arrive out of order. */
  providerUpdatedAt: Date;
  testMode: boolean;
  /** A pre-signed customer portal link (Lemon Squeezy: valid 24 hours), if the event had one. */
  portalUrl: string | null;
}

export interface Subscription extends Omit<SubscriptionSnapshot, "userId"> {
  /** Null when we couldn't tie it to one of our users ("unlinked"). */
  userId: string | null;
  /** The user's Dota account, copied when linked (supporter badges on leaderboards). */
  accountId32: number | null;
  /** When it first went past due (the grace period counts from here); null otherwise. */
  pastDueSince: Date | null;
  /** When `portalUrl` was received (it expires). */
  portalUrlAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Our id for a provider's subscription. */
export const subscriptionKey = (provider: BillingProviderName, subscriptionId: string) =>
  `${provider}:${subscriptionId}`;

export type ApplyOutcome =
  | { kind: "apply"; next: Subscription }
  /** Older than what we have: an out-of-order delivery, ignored. */
  | { kind: "stale" };

/**
 * The stored subscription after one webhook. Out-of-order deliveries (older `updated_at` than
 * the stored one) change nothing. The user link is kept once known (later events may lack the
 * custom data), and the past-due clock starts at the first past-due update and keeps running
 * until the status changes.
 */
export function applySnapshot(
  existing: Subscription | null,
  incoming: SubscriptionSnapshot,
  link: { userId: string; accountId32: number } | null,
  now: Date,
): ApplyOutcome {
  if (existing && incoming.providerUpdatedAt.getTime() < existing.providerUpdatedAt.getTime())
    return { kind: "stale" };
  const pastDueSince =
    incoming.status !== "past_due"
      ? null
      : existing?.status === "past_due" && existing.pastDueSince
        ? existing.pastDueSince
        : incoming.providerUpdatedAt;
  const keepsPortal = incoming.portalUrl === null && existing?.portalUrl;
  return {
    kind: "apply",
    next: {
      ...incoming,
      userId: link?.userId ?? existing?.userId ?? null,
      accountId32: link?.accountId32 ?? existing?.accountId32 ?? null,
      pastDueSince,
      portalUrl: keepsPortal ? existing!.portalUrl : incoming.portalUrl,
      portalUrlAt: keepsPortal ? existing!.portalUrlAt : incoming.portalUrl ? now : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  };
}
