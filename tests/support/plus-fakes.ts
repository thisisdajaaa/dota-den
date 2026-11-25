import type { DataOwner } from "@/common/privacy/user-data";
import { subscriptionKey, type Subscription } from "@/modules/plus/domain/subscription";
import type { WebhookEventOutcome } from "@/modules/plus/plus.model";
import type { FreeTrial } from "@/modules/plus/domain/trial";
import type { PlusGrant, Referral } from "@/modules/plus/domain/referral";
import type {
  GrantsPort,
  ReferralsPort,
  SubscriptionsPort,
  TrialsPort,
  WebhookEventsPort,
} from "@/modules/plus/plus.ports";
import { POSSIBLY_ENTITLED } from "@/modules/plus/domain/entitlement";

/** A Polar subscription webhook body, shaped like the 2026-10 OpenAPI schema (`Subscription`). */
export function polarSubscriptionEvent(
  opts: {
    type?: string;
    id?: string;
    status?: string;
    userId?: string | null;
    externalId?: string | null;
    modifiedAt?: string | null;
    periodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    endsAt?: string | null;
    endedAt?: string | null;
    productId?: string;
    productPlan?: string;
  } = {},
): string {
  const userId = opts.userId === undefined ? "a".repeat(24) : opts.userId;
  return JSON.stringify({
    type: opts.type ?? "subscription.created",
    timestamp: "2026-10-23T12:00:00.000000Z",
    api_version: "2026-10",
    data: {
      created_at: "2026-10-23T12:00:00.000000Z",
      modified_at: opts.modifiedAt === undefined ? "2026-10-23T12:00:00.000000Z" : opts.modifiedAt,
      id: opts.id ?? "5c7c1f2e-0d8f-4f3f-9a54-0a9b6b1c2d3e",
      amount: 29900,
      currency: "php",
      recurring_interval: "month",
      recurring_interval_count: 1,
      status: opts.status ?? "active",
      current_period_start: "2026-10-23T12:00:00.000000Z",
      current_period_end: opts.periodEnd ?? "2026-11-23T12:00:00.000000Z",
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      canceled_at: null,
      started_at: "2026-10-23T12:00:00.000000Z",
      ends_at: opts.endsAt ?? null,
      ended_at: opts.endedAt ?? null,
      customer_id: "9d1b8c4e-3a2f-4e5d-8c7b-6a5f4e3d2c1b",
      product_id: opts.productId ?? "e7751461-934e-4bbc-befa-2593e1e56dd2",
      discount_id: null,
      checkout_id: "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b",
      metadata: userId === null ? {} : { user_id: userId, plan: "monthly" },
      customer: {
        id: "9d1b8c4e-3a2f-4e5d-8c7b-6a5f4e3d2c1b",
        external_id: opts.externalId ?? null,
        email: "buyer@example.com",
        name: "Some Buyer",
        billing_address: { country: "PH" },
      },
      product: {
        id: opts.productId ?? "e7751461-934e-4bbc-befa-2593e1e56dd2",
        name: "Dota Den Plus (monthly)",
        metadata: { plan: opts.productPlan ?? "monthly" },
      },
    },
  });
}

/** A Lemon Squeezy subscription webhook body, shaped like the documented payloads. */
export function lsSubscriptionEvent(
  opts: {
    event?: string;
    id?: string;
    status?: string;
    userId?: string | null;
    updatedAt?: string;
    renewsAt?: string | null;
    endsAt?: string | null;
    testMode?: boolean;
    variantId?: number;
    portal?: string | null;
  } = {},
): string {
  return JSON.stringify({
    meta: {
      event_name: opts.event ?? "subscription_created",
      ...(opts.userId === null ? {} : { custom_data: { user_id: opts.userId ?? "a".repeat(24) } }),
    },
    data: {
      type: "subscriptions",
      id: opts.id ?? "1001",
      attributes: {
        store_id: 1,
        customer_id: 77,
        variant_id: opts.variantId ?? 501,
        user_name: "Someone",
        user_email: "someone@example.com",
        status: opts.status ?? "active",
        renews_at: opts.renewsAt === undefined ? "2026-11-23T12:00:00.000000Z" : opts.renewsAt,
        ends_at: opts.endsAt ?? null,
        trial_ends_at: null,
        created_at: "2026-10-23T12:00:00.000000Z",
        updated_at: opts.updatedAt ?? "2026-10-23T12:00:00.000000Z",
        test_mode: opts.testMode ?? false,
        urls: {
          update_payment_method: "https://dd.lemonsqueezy.com/subscription/1/payment",
          customer_portal:
            opts.portal === undefined
              ? "https://dd.lemonsqueezy.com/billing?signed=1"
              : opts.portal,
        },
      },
    },
  });
}

/** In-memory SubscriptionsPort with the same "newer wins" rule as the Mongo one. */
export class MemorySubscriptions implements SubscriptionsPort {
  readonly docs = new Map<string, Subscription>();

  async find(provider: Subscription["provider"], id: string) {
    return this.docs.get(subscriptionKey(provider, id)) ?? null;
  }
  async upsertIfNewer(sub: Subscription) {
    const key = subscriptionKey(sub.provider, sub.subscriptionId);
    const existing = this.docs.get(key);
    if (existing && existing.providerUpdatedAt > sub.providerUpdatedAt) return "stale" as const;
    this.docs.set(key, { ...sub, createdAt: existing?.createdAt ?? sub.createdAt });
    return existing ? ("updated" as const) : ("inserted" as const);
  }
  async forUser(userId: string) {
    return [...this.docs.values()].filter((s) => s.userId === userId);
  }
  async possiblyEntitledForAccounts(ids: readonly number[]) {
    return [...this.docs.values()].filter(
      (s) =>
        s.accountId32 !== null &&
        ids.includes(s.accountId32) &&
        POSSIBLY_ENTITLED.includes(s.status),
    );
  }
  async possiblyEntitled() {
    return [...this.docs.values()].filter((s) => s.userId && POSSIBLY_ENTITLED.includes(s.status));
  }
  async subscriberUserIds(testMode: boolean | null) {
    return [
      ...new Set(
        [...this.docs.values()]
          .filter((d) => d.userId && (testMode === null || d.testMode === testMode))
          .map((d) => d.userId!),
      ),
    ];
  }
  async countsByStatus(testMode: boolean | null) {
    const counts = new Map<
      string,
      { status: Subscription["status"]; linked: boolean; count: number }
    >();
    for (const s of this.docs.values()) {
      if (testMode !== null && s.testMode !== testMode) continue;
      const k = `${s.status}:${s.userId !== null}`;
      const row = counts.get(k) ?? { status: s.status, linked: s.userId !== null, count: 0 };
      row.count++;
      counts.set(k, row);
    }
    return [...counts.values()];
  }
  async exportForOwner(owner: DataOwner) {
    return (await this.forUser(owner.userId)).map((s) => ({ ...s }));
  }
  async deleteForOwner(owner: DataOwner) {
    let n = 0;
    for (const [k, s] of this.docs) if (s.userId === owner.userId && this.docs.delete(k)) n++;
    return n;
  }
}

export class MemoryWebhookEvents implements WebhookEventsPort {
  readonly events = new Map<
    string,
    { outcome: WebhookEventOutcome; userId: string | null; claimedAt?: Date }
  >();

  async claim(e: Parameters<WebhookEventsPort["claim"]>[0], staleMs: number) {
    const existing = this.events.get(e.id);
    if (
      !existing ||
      (existing.outcome === "processing" &&
        existing.claimedAt &&
        existing.claimedAt.getTime() < e.receivedAt.getTime() - staleMs)
    ) {
      this.events.set(e.id, { outcome: "processing", userId: e.userId, claimedAt: e.receivedAt });
      return "claimed" as const;
    }
    return existing.outcome === "processing" ? ("in_progress" as const) : ("duplicate" as const);
  }
  async finish(id: string, outcome: WebhookEventOutcome, userId?: string | null) {
    const e = this.events.get(id);
    if (e) this.events.set(id, { outcome, userId: userId === undefined ? e.userId : userId });
  }
  async release(id: string) {
    this.events.delete(id);
  }
  async exportForOwner(owner: DataOwner) {
    return [...this.events.values()]
      .filter((e) => e.userId === owner.userId)
      .map((e) => ({ ...e }));
  }
  async deleteForOwner(owner: DataOwner) {
    let n = 0;
    for (const [k, e] of this.events) if (e.userId === owner.userId && this.events.delete(k)) n++;
    return n;
  }
}

export class MemoryTrials implements TrialsPort {
  readonly docs = new Map<number, FreeTrial>();

  async find(userId: string, accountId32?: number) {
    return (
      [...this.docs.values()].find(
        (t) => t.userId === userId || (accountId32 !== undefined && t.accountId32 === accountId32),
      ) ?? null
    );
  }
  async start(trial: FreeTrial) {
    if (this.docs.has(trial.accountId32)) return false;
    this.docs.set(trial.accountId32, trial);
    return true;
  }
  async endingBetween(from: Date, to: Date) {
    return [...this.docs.values()]
      .filter((t) => t.endsAt > from && t.endsAt <= to)
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  }
  async activeUserIds(now: Date) {
    return [...this.docs.values()].filter((t) => t.endsAt > now).map((t) => t.userId);
  }
  async userIds() {
    return [...new Set([...this.docs.values()].map((t) => t.userId))];
  }
  /** Set by a test: what the subscribed count reads (the fake has no subscriptions). */
  subscribed = 0;
  async counts(now: Date) {
    return {
      started: this.docs.size,
      active: (await this.activeUserIds(now)).length,
      subscribed: this.subscribed,
    };
  }
  async exportForOwner(owner: DataOwner) {
    return [...this.docs.values()].filter((t) => t.userId === owner.userId).map((t) => ({ ...t }));
  }
  async deleteForOwner(owner: DataOwner) {
    let n = 0;
    for (const [k, t] of this.docs) if (t.userId === owner.userId && this.docs.delete(k)) n++;
    return n;
  }
}

/** In-memory ReferralsPort: one claim per friend account, codes unique. */
export class MemoryReferrals implements ReferralsPort {
  readonly codes = new Map<string, { userId: string; accountId32: number; createdAt: Date }>();
  readonly claims = new Map<number, Referral>();

  async codeOf(userId: string) {
    for (const [code, c] of this.codes) if (c.userId === userId) return code;
    return null;
  }
  async saveCode(c: { code: string; userId: string; accountId32: number; createdAt: Date }) {
    if (this.codes.has(c.code) || (await this.codeOf(c.userId))) return false;
    this.codes.set(c.code, {
      userId: c.userId,
      accountId32: c.accountId32,
      createdAt: c.createdAt,
    });
    return true;
  }
  async ownerOf(code: string) {
    const c = this.codes.get(code);
    return c ? { userId: c.userId, accountId32: c.accountId32 } : null;
  }
  async claimOf(account: number, userId?: string) {
    return (
      this.claims.get(account) ??
      [...this.claims.values()].find((r) => userId !== undefined && r.friendUserId === userId) ??
      null
    );
  }
  async claim(r: Referral) {
    if (this.claims.has(r.friendAccountId32)) return false;
    this.claims.set(r.friendAccountId32, { ...r });
    return true;
  }
  async byReferrer(referrerId: string) {
    return [...this.claims.values()]
      .filter((r) => r.referrerId === referrerId)
      .sort((a, b) => b.claimedAt.getTime() - a.claimedAt.getTime());
  }
  async settle(
    account: number,
    update: { status: "rewarded" | "expired"; rewardedAt: Date | null; referrerRewarded: boolean },
  ) {
    const r = this.claims.get(account);
    if (!r || r.status !== "pending") return false;
    Object.assign(r, update);
    return true;
  }
  async counts() {
    const all = [...this.claims.values()];
    return {
      claimed: all.length,
      pending: all.filter((r) => r.status === "pending").length,
      rewarded: all.filter((r) => r.status === "rewarded").length,
    };
  }
  async exportForOwner() {
    return [];
  }
  async deleteForOwner() {
    return 0;
  }
}

/** In-memory GrantsPort. */
export class MemoryGrants implements GrantsPort {
  readonly docs = new Map<string, PlusGrant>();
  async forUser(userId: string) {
    return [...this.docs.values()].filter((g) => g.userId === userId);
  }
  async give(g: PlusGrant) {
    if (this.docs.has(g.id)) return false;
    this.docs.set(g.id, g);
    return true;
  }
  async activeUserIds(now: Date) {
    return [
      ...new Set(
        [...this.docs.values()]
          .filter((g) => g.startsAt <= now && now < g.endsAt)
          .map((g) => g.userId),
      ),
    ];
  }
  async exportForOwner() {
    return [];
  }
  async deleteForOwner(owner: DataOwner) {
    let n = 0;
    for (const [id, g] of this.docs)
      if (g.userId === owner.userId) {
        this.docs.delete(id);
        n++;
      }
    return n;
  }
}
