import type { DataOwner } from "@/common/privacy/user-data";
import type { Plan } from "./domain/plans";
import type {
  BillingProviderName,
  Subscription,
  SubscriptionSnapshot,
  SubscriptionStatus,
} from "./domain/subscription";
import type { FreeTrial } from "./domain/trial";
import type { WebhookEventOutcome } from "./plus.model";

/** A verified, parsed webhook event in provider-neutral terms. */
export type BillingEvent =
  | {
      kind: "subscription";
      eventId: string;
      eventName: string;
      testMode: boolean;
      snapshot: SubscriptionSnapshot;
    }
  | {
      /** Orders, invoices, refunds…: recorded and acknowledged; subscription events carry the state. */
      kind: "other";
      eventId: string;
      eventName: string;
      testMode: boolean;
      subscriptionId: string | null;
      userId: string | null;
    };

/**
 * The payment provider (merchant of record) behind Plus. One adapter per provider; the app only
 * sees this interface (ADR 0013).
 */
export interface BillingProvider {
  readonly name: BillingProviderName;
  /** True when the raw body is signed with our webhook secret. Never throws. */
  verify(body: string, header: (name: string) => string | null): boolean;
  /**
   * A verified body as an event; null when it isn't one we understand. `header` gives the
   * delivery's headers (Polar's `webhook-id` is the event id).
   */
  parse(body: string, header?: (name: string) => string | null): BillingEvent | null;
  /** Plans that can be bought, in display order. */
  readonly plans: readonly Plan[];
  /**
   * The hosted checkout for a plan, carrying our user id so the webhook can link it. May call
   * the provider (Polar creates a checkout session); throws an AppError the player can read
   * when that fails, null when the plan isn't offered. `context.ip` is the buyer's IP (Polar
   * uses it for country and tax when the session is made on our server).
   */
  checkoutUrl(plan: Plan, userId: string, context?: { ip?: string | null }): Promise<string | null>;
  /** The provider's generic customer portal (sign-in by email), when known. */
  readonly portalUrl: string | null;
  /**
   * A signed-in portal link for one of the provider's customers, made on demand (Polar's
   * customer sessions). Optional; null or a failure falls back to `portalUrl`.
   */
  customerPortalUrl?(customerId: string): Promise<string | null>;
  /** Whether this deployment takes test-mode events (and ignores live ones). */
  readonly testMode: boolean;
}

export type UpsertOutcome = "inserted" | "updated" | "stale";

export interface SubscriptionsPort {
  find(provider: BillingProviderName, subscriptionId: string): Promise<Subscription | null>;
  /**
   * Writes the subscription unless the stored one has a newer provider `updated_at` (checked in
   * the same write, so two concurrent deliveries can't go backwards).
   */
  upsertIfNewer(sub: Subscription): Promise<UpsertOutcome>;
  forUser(userId: string): Promise<Subscription[]>;
  /** Subscriptions of these Dota accounts that may grant Plus (for badges). */
  possiblyEntitledForAccounts(accountIds: readonly number[]): Promise<Subscription[]>;
  /** Every linked subscription that may grant Plus (for go-live alerts). */
  possiblyEntitled(): Promise<Subscription[]>;
  /** Subscriptions per status, of one mode (test or live), or of both when `testMode` is null. */
  countsByStatus(
    testMode: boolean | null,
  ): Promise<{ status: SubscriptionStatus; linked: boolean; count: number }[]>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface TrialsPort {
  /** This player's trial, by user or by Steam account (either one blocks a second trial). */
  find(userId: string, accountId32?: number): Promise<FreeTrial | null>;
  /** Records a new trial; false when this account already had one. */
  start(trial: FreeTrial): Promise<boolean>;
  /** Trials ending after `from` and at or before `to` (reminders), soonest first. */
  endingBetween(from: Date, to: Date): Promise<FreeTrial[]>;
  /** Users whose trial is running at `now`. */
  activeUserIds(now: Date): Promise<string[]>;
  /** Trials started, and running at `now` (admin). */
  counts(now: Date): Promise<{ started: number; active: number }>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export type WebhookClaim = "claimed" | "duplicate" | "in_progress";

export interface WebhookEventsPort {
  /**
   * Claims an event id: "claimed" to handle it; "duplicate" when it was already handled (a
   * retry or a replay); "in_progress" while another delivery is still handling it. A claim
   * older than `staleMs` (a function killed mid-way) can be taken over.
   */
  claim(
    event: {
      id: string;
      provider: BillingProviderName;
      eventName: string;
      subscriptionId: string | null;
      userId: string | null;
      receivedAt: Date;
    },
    staleMs: number,
  ): Promise<WebhookClaim>;
  finish(id: string, outcome: WebhookEventOutcome, userId?: string | null): Promise<void>;
  /** Forget a claim whose handling failed, so the provider's retry is handled. */
  release(id: string): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** Our users, to link a purchase to an account (from identity). */
export interface PlusUserLookup {
  byId(userId: string): Promise<{ id: string; accountId32: number } | null>;
}
