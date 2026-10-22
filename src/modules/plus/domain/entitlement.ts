/**
 * Who has Plus right now (pure). Computed on the server from stored subscription state only;
 * nothing the browser sends can grant it (ADR 0013).
 *
 * - `active`, `on_trial`: Plus.
 * - `past_due`: Plus for a grace period after the first failed renewal, while the provider
 *   retries the card; then free until a payment succeeds.
 * - `cancelled`: Plus until the end of the period already paid for (`ends_at`).
 * - `paused`, `unpaid`, `expired`: free.
 * - Kill switch (PLUS_ENABLED not "true"): everyone is free; stored data is kept.
 */
import type { Plan } from "./plans";
import type { Subscription, SubscriptionStatus } from "./subscription";

/** How long a failed renewal keeps Plus (Lemon Squeezy retries for about two weeks). */
export const PAST_DUE_GRACE_MS = 7 * 24 * 3_600_000;

export type EntitlementReason =
  "active" | "trial" | "grace" | "cancelled_until_period_end" | "none" | "disabled";

export interface Entitlement {
  plus: boolean;
  reason: EntitlementReason;
  /** When Plus ends if nothing changes (cancelled: period end; grace: grace end); else null. */
  until: Date | null;
}

const FREE: Entitlement = { plus: false, reason: "none", until: null };

type Entitling = Pick<
  Subscription,
  "status" | "endsAt" | "renewsAt" | "pastDueSince" | "providerUpdatedAt"
>;

/** One subscription's entitlement at `now`. */
export function entitlementOf(sub: Entitling, now: Date): Entitlement {
  const t = now.getTime();
  switch (sub.status) {
    case "active":
      return { plus: true, reason: "active", until: null };
    case "on_trial":
      return { plus: true, reason: "trial", until: null };
    case "past_due": {
      const since = (sub.pastDueSince ?? sub.providerUpdatedAt).getTime();
      const until = new Date(since + PAST_DUE_GRACE_MS);
      return t < until.getTime() ? { plus: true, reason: "grace", until } : FREE;
    }
    case "cancelled": {
      // Lemon Squeezy sets ends_at on cancellation; renews_at is the same period end.
      const end = sub.endsAt ?? sub.renewsAt;
      return end && t < end.getTime()
        ? { plus: true, reason: "cancelled_until_period_end", until: end }
        : FREE;
    }
    case "paused":
    case "unpaid":
    case "expired":
      return FREE;
  }
}

const RANK: Record<EntitlementReason, number> = {
  active: 5,
  trial: 4,
  cancelled_until_period_end: 3,
  grace: 2,
  none: 1,
  disabled: 0,
};

/**
 * A player's entitlement across all their subscriptions (the best one wins; between two
 * time-limited ones, the later end). `enabled` false is the kill switch.
 */
export function entitlementFor(
  subs: readonly Entitling[],
  now: Date,
  enabled: boolean,
): Entitlement {
  if (!enabled) return { plus: false, reason: "disabled", until: null };
  let best = FREE;
  for (const sub of subs) {
    const e = entitlementOf(sub, now);
    if (
      RANK[e.reason] > RANK[best.reason] ||
      (e.reason === best.reason && (e.until?.getTime() ?? 0) > (best.until?.getTime() ?? 0))
    )
      best = e;
  }
  return best;
}

/** Statuses that can grant Plus at some `now` (the rest never do): narrows database queries. */
export const POSSIBLY_ENTITLED: readonly SubscriptionStatus[] = [
  "active",
  "on_trial",
  "past_due",
  "cancelled",
];

/** What the account page shows about the player's plan. */
export interface PlanSummary {
  entitlement: Entitlement;
  /** The subscription that grants it (or the most recent one), when there is one. */
  status: SubscriptionStatus | null;
  plan: Plan | null;
  renewsAt: Date | null;
  endsAt: Date | null;
}

/** The subscription to describe: the one granting Plus, else the most recently updated. */
export function summarise(subs: readonly Subscription[], now: Date, enabled: boolean): PlanSummary {
  const entitlement = entitlementFor(subs, now, enabled);
  const sorted = [...subs].sort(
    (a, b) => b.providerUpdatedAt.getTime() - a.providerUpdatedAt.getTime(),
  );
  const granting = sorted.find((s) => entitlementOf(s, now).plus) ?? sorted[0] ?? null;
  return {
    entitlement,
    status: granting?.status ?? null,
    plan: granting?.plan ?? null,
    renewsAt: granting?.renewsAt ?? null,
    endsAt: granting?.endsAt ?? null,
  };
}

/**
 * Whether deleting the account should warn that billing continues: a subscription that will
 * still charge (anything not cancelled or expired).
 */
export function stillBills(subs: readonly Pick<Subscription, "status">[]): boolean {
  return subs.some((s) =>
    ["active", "on_trial", "past_due", "paused", "unpaid"].includes(s.status),
  );
}
