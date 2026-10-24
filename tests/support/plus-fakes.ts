import type { DataOwner } from "@/common/privacy/user-data";
import { subscriptionKey, type Subscription } from "@/modules/plus/domain/subscription";
import type { WebhookEventOutcome } from "@/modules/plus/plus.model";
import type { SubscriptionsPort, WebhookEventsPort } from "@/modules/plus/plus.ports";
import { POSSIBLY_ENTITLED } from "@/modules/plus/domain/entitlement";

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
