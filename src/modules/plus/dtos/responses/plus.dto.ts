import type { EntitlementReason } from "../../domain/entitlement";
import type { Plan } from "../../domain/plans";
import type { BillingProviderName, SubscriptionStatus } from "../../domain/subscription";
import type { TrialStatus } from "../../domain/trial";

/**
 * Whether Plus can be bought here: "off" (not configured: the pricing page says "coming soon"
 * and nothing links to it), "paused" (configured, kill switch on: no new purchases), or
 * "available" (checkout buttons for `plans`).
 */
export interface PlusOfferDto {
  status: "off" | "paused" | "available";
  plans: Plan[];
  /** The configured payment provider (named on the page and the legal pages), or null. */
  provider: BillingProviderName | null;
}

/** The account page's "Your plan" card and GET /api/v1/me/plus. */
export interface PlanDto {
  plus: boolean;
  reason: EntitlementReason;
  /** When Plus ends if nothing changes (cancelled or in grace); ISO. */
  until: string | null;
  status: SubscriptionStatus | null;
  plan: Plan | null;
  renewsAt: string | null;
  endsAt: string | null;
  /** A billing portal link exists (manage, update card, cancel). */
  canManage: boolean;
  /** Deleting the account doesn't stop billing: show the warning. */
  stillBills: boolean;
  /** The free 7-day trial: whether it can be started, and when a running one ends (ISO). */
  trial: { status: TrialStatus; endsAt: string | null };
}

/** Admin: subscriptions by status (no personal data). */
export interface PlusAdminCountsDto {
  configured: boolean;
  enabled: boolean;
  byStatus: { status: SubscriptionStatus; count: number }[];
  /** Subscriptions we couldn't tie to a user (missing or unknown custom data). */
  unlinked: number;
  /** Players with Plus right now (free trials included). */
  entitled: number;
  /** Free trials started, and running now; null when unknown. */
  trials: { started: number; active: number } | null;
}

export interface WebhookResultDto {
  outcome: "applied" | "duplicate" | "stale" | "unlinked" | "ignored" | "mode_mismatch";
}
