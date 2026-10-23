import { isPlan, PLANS, USER_ID_PATTERN, type Plan } from "../domain/plans";
import { isSubscriptionStatus, type SubscriptionSnapshot } from "../domain/subscription";
import { verifyLemonSqueezySignature, webhookEventId } from "../domain/webhook-signature";
import type { BillingEvent, BillingProvider } from "../plus.ports";
import {
  LemonSqueezyEventSchema,
  LemonSqueezySubscriptionSchema,
} from "../schemas/lemon-squeezy-webhook.schema";

export interface LemonSqueezyConfig {
  /** The webhook's signing secret (Settings → Webhooks). */
  webhookSecret: string;
  /** Hosted checkout links per plan (the variant's share link), when that plan is offered. */
  checkoutUrls: Partial<Record<Plan, string>>;
  /** The store's own URL (https://<store>.lemonsqueezy.com or a custom domain). */
  storeUrl: string | null;
  /** Variant ids per plan, to name the plan in webhooks (optional). */
  variantIds: Partial<Record<Plan, string>>;
  testMode: boolean;
}

const date = (v: string | null | undefined) => (v ? new Date(v) : null);

/**
 * Lemon Squeezy as the merchant of record (facts verified against its docs on 2026-10-23, see
 * ADR 0013):
 *
 * - Webhooks: POST with `X-Event-Name` and `X-Signature` (HMAC-SHA256 hex of the raw body).
 * - Checkout custom data: `?checkout[custom][user_id]=…` on a checkout link comes back in
 *   `meta.custom_data.user_id` (as a string) on order and subscription events.
 * - Subscription objects carry `status`, `renews_at`, `ends_at`, `trial_ends_at`,
 *   `updated_at`, `test_mode` and `urls.customer_portal` (pre-signed, valid 24 hours).
 * - The generic customer portal is `https://<store>.lemonsqueezy.com/billing`.
 */
export class LemonSqueezyProvider implements BillingProvider {
  readonly name = "lemonsqueezy" as const;

  constructor(private readonly config: LemonSqueezyConfig) {}

  get plans(): readonly Plan[] {
    return PLANS.filter((p) => !!this.config.checkoutUrls[p]);
  }

  get testMode(): boolean {
    return this.config.testMode;
  }

  get portalUrl(): string | null {
    const base = this.config.storeUrl ?? this.firstCheckoutOrigin();
    return base ? `${base.replace(/\/$/, "")}/billing` : null;
  }

  private firstCheckoutOrigin(): string | null {
    const url = Object.values(this.config.checkoutUrls).find(Boolean);
    try {
      return url ? new URL(url).origin : null;
    } catch {
      return null;
    }
  }

  verify(body: string, header: (name: string) => string | null): boolean {
    return verifyLemonSqueezySignature({
      secret: this.config.webhookSecret,
      signature: header("x-signature"),
      body,
    });
  }

  checkoutUrl(plan: Plan, userId: string): string | null {
    const link = this.config.checkoutUrls[plan];
    if (!link || !USER_ID_PATTERN.test(userId)) return null;
    const url = new URL(link);
    url.searchParams.set("checkout[custom][user_id]", userId);
    return url.toString();
  }

  parse(body: string): BillingEvent | null {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const event = LemonSqueezyEventSchema.safeParse(json);
    if (!event.success) return null;
    const { meta, data } = event.data;
    const eventId = webhookEventId(this.name, body);
    const rawUser = meta.custom_data?.user_id;
    const userId =
      typeof rawUser === "string" && USER_ID_PATTERN.test(rawUser.trim()) ? rawUser.trim() : null;

    if (data.type !== "subscriptions") {
      const attrs = (data as { attributes?: { subscription_id?: unknown } }).attributes;
      const subscriptionId =
        attrs &&
        (typeof attrs.subscription_id === "number" || typeof attrs.subscription_id === "string")
          ? String(attrs.subscription_id)
          : null;
      return {
        kind: "other",
        eventId,
        eventName: meta.event_name,
        testMode: meta.test_mode ?? false,
        subscriptionId,
        userId,
      };
    }

    const sub = LemonSqueezySubscriptionSchema.safeParse(data);
    if (!sub.success) return null;
    const a = sub.data.attributes;
    if (!isSubscriptionStatus(a.status)) return null;
    const variantId = a.variant_id ?? null;
    const plan =
      PLANS.find((p) => variantId !== null && this.config.variantIds[p] === variantId) ?? null;
    const testMode = a.test_mode ?? meta.test_mode ?? false;
    const snapshot: SubscriptionSnapshot = {
      provider: this.name,
      subscriptionId: sub.data.id,
      userId,
      status: a.status,
      plan: isPlan(plan) ? plan : null,
      variantId,
      customerId: a.customer_id ?? null,
      renewsAt: date(a.renews_at),
      endsAt: date(a.ends_at),
      trialEndsAt: date(a.trial_ends_at),
      providerUpdatedAt: new Date(a.updated_at),
      testMode,
      // We redirect players to it: only an https link is kept.
      portalUrl: a.urls?.customer_portal?.startsWith("https://") ? a.urls.customer_portal : null,
    };
    return { kind: "subscription", eventId, eventName: meta.event_name, testMode, snapshot };
  }
}
