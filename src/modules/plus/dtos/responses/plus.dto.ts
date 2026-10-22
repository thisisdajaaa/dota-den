import type { EntitlementReason } from "../../domain/entitlement";
import type { Plan } from "../../domain/plans";
import type { SubscriptionStatus } from "../../domain/subscription";

/**
 * Whether Plus can be bought here: "off" (not configured: the pricing page says "coming soon"
 * and nothing links to it), "paused" (configured, kill switch on: no new purchases), or
 * "available" (checkout buttons for `plans`).
 */
export interface PlusOfferDto {
  status: "off" | "paused" | "available";
  plans: Plan[];
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
}

/** Admin: subscriptions by status (no personal data). */
export interface PlusAdminCountsDto {
  configured: boolean;
  enabled: boolean;
  byStatus: { status: SubscriptionStatus; count: number }[];
  /** Subscriptions we couldn't tie to a user (missing or unknown custom data). */
  unlinked: number;
  /** Players with Plus right now. */
  entitled: number;
}

export interface WebhookResultDto {
  outcome: "applied" | "duplicate" | "stale" | "unlinked" | "ignored" | "mode_mismatch";
}
