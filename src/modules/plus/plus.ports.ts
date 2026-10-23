import type { DataOwner } from "@/common/privacy/user-data";
import type { Plan } from "./domain/plans";
import type {
  BillingProviderName,
  Subscription,
  SubscriptionSnapshot,
  SubscriptionStatus,
} from "./domain/subscription";
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
  /** A verified body as an event; null when it isn't one we understand. */
  parse(body: string): BillingEvent | null;
  /** Plans that have a checkout link set up, in display order. */
  readonly plans: readonly Plan[];
  /** The hosted checkout for a plan, carrying our user id so the webhook can link it. */
  checkoutUrl(plan: Plan, userId: string): string | null;
  /** The provider's generic customer portal (sign-in by email link), when known. */
  readonly portalUrl: string | null;
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
  countsByStatus(): Promise<{ status: SubscriptionStatus; linked: boolean; count: number }[]>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

export interface WebhookEventsPort {
  /** Claims an event id; false when it was already received (a retry or a replay). */
  claim(event: {
    id: string;
    provider: BillingProviderName;
    eventName: string;
    subscriptionId: string | null;
    userId: string | null;
    receivedAt: Date;
  }): Promise<boolean>;
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
