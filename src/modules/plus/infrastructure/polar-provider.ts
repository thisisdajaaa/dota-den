import { isIP } from "node:net";
import { UpstreamUnavailableError } from "@/common/errors/app-error";
import { PLANS, USER_ID_PATTERN, type Plan } from "../domain/plans";
import type { SubscriptionSnapshot, SubscriptionStatus } from "../domain/subscription";
import { verifyPolarSignature, webhookEventId } from "../domain/webhook-signature";
import type { BillingEvent, BillingProvider } from "../plus.ports";
import { PolarEventSchema, PolarSubscriptionSchema } from "../schemas/polar-webhook.schema";
import type { z } from "zod";
import type { PolarApiClient, PolarServer } from "./polar-api-client";

export interface PolarConfig {
  /** The webhook endpoint's secret (`whsec_…`, Settings → Webhooks). */
  webhookSecret: string;
  /** Product ids per plan; a plan without one isn't offered. */
  productIds: Partial<Record<Plan, string>>;
  /** The organization's slug (its customer portal is polar.sh/<slug>/portal). */
  organizationSlug: string;
  server: PolarServer;
  /** Our own origin, for the checkout's success and back links. */
  appUrl: string;
  /** Creates checkout and customer portal sessions (needs the access token). */
  api: Pick<PolarApiClient, "createCheckout" | "createCustomerSession">;
  now?: () => Date;
}

const date = (v: string | null | undefined) => (v ? new Date(v) : null);

/**
 * The events the webhook endpoint subscribes to (scripts/polar-provision.ts): the subscription
 * lifecycle (`subscription.updated` is Polar's catch-all; the others carry the same object) and
 * refunds, which alert the owner. Other events would only be recorded and ignored.
 */
export const POLAR_WEBHOOK_EVENTS = [
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "order.refunded",
] as const;

/** The checkout couldn't be created: the player sees this and can try again. */
const CHECKOUT_DOWN =
  "The checkout isn't available right now. Nothing was charged; please try again in a few minutes.";

/** The body of POST /v1/checkouts/ for one plan and player (pure, exported for tests). */
export function polarCheckoutRequest(input: {
  productId: string;
  plan: Plan;
  userId: string;
  appUrl: string;
  ip?: string | null;
}): Record<string, unknown> {
  const app = input.appUrl.replace(/\/$/, "");
  return {
    products: [input.productId],
    // Both come back on the subscription: metadata (copied from the checkout to the
    // subscription and its orders) is what we link by; the external id ties the Polar
    // customer to our user for reconciliation in the dashboard.
    metadata: { user_id: input.userId, plan: input.plan },
    external_customer_id: input.userId,
    success_url: `${app}/account#plan`,
    return_url: `${app}/plus`,
    // Made on our server, so Polar would see our IP: pass the buyer's for country and tax.
    ...(input.ip && isIP(input.ip) ? { customer_ip_address: input.ip } : {}),
  };
}

type PolarSubscription = z.infer<typeof PolarSubscriptionSchema>;

/**
 * Polar's subscription state in our vocabulary (ADR 0013), or null for a subscription that
 * never started (`incomplete`: the first payment hasn't gone through; nothing to store).
 *
 * - `trialing` → `on_trial`; `active` → `active`; both renew at `current_period_end`.
 * - Cancelled at period end: Polar keeps `active` (or `trialing`) with
 *   `cancel_at_period_end: true` → `cancelled`, Plus until `ends_at` (else the period end).
 * - `canceled` is Polar's revoked/ended state → `expired` (ended at `ended_at`). If it still
 *   names an end after the event time without having ended, it's `cancelled` until then.
 * - `past_due` → `past_due` (our 7-day grace); `unpaid` (retries exhausted) → `unpaid`;
 *   `paused` → `paused`; `incomplete_expired` → `expired`.
 */
export function polarStatus(
  s: Pick<
    PolarSubscription,
    "status" | "cancel_at_period_end" | "current_period_end" | "ends_at" | "ended_at"
  >,
  updatedAt: Date,
): { status: SubscriptionStatus; renewsAt: Date | null; endsAt: Date | null } | null {
  const periodEnd = date(s.current_period_end);
  const endsAt = date(s.ends_at);
  const endedAt = date(s.ended_at);
  switch (s.status) {
    case "trialing":
    case "active":
      if (s.cancel_at_period_end || endsAt)
        return { status: "cancelled", renewsAt: null, endsAt: endsAt ?? periodEnd };
      return { status: s.status === "active" ? "active" : "on_trial", renewsAt: periodEnd, endsAt };
    case "past_due":
      return { status: "past_due", renewsAt: periodEnd, endsAt };
    case "canceled": {
      const end = endedAt ?? endsAt;
      if (!endedAt && end && end.getTime() > updatedAt.getTime())
        return { status: "cancelled", renewsAt: null, endsAt: end };
      return { status: "expired", renewsAt: null, endsAt: end };
    }
    case "unpaid":
      return { status: "unpaid", renewsAt: null, endsAt };
    case "paused":
      return { status: "paused", renewsAt: null, endsAt };
    case "incomplete_expired":
      return { status: "expired", renewsAt: null, endsAt: endedAt ?? endsAt };
    default:
      // "incomplete" (never started) or a status added in a later API version.
      return null;
  }
}

/** Our user id from the metadata we set at checkout, else the customer's external id. */
function ourUserId(
  metadata: Record<string, unknown> | null | undefined,
  externalId: string | null | undefined,
): string | null {
  for (const raw of [metadata?.user_id, externalId]) {
    if (typeof raw === "string" && USER_ID_PATTERN.test(raw.trim())) return raw.trim();
  }
  return null;
}

/** A sane delivery id to key the event by (Standard Webhooks `webhook-id`). */
const DELIVERY_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Polar as the merchant of record (facts verified against its docs and OpenAPI schema,
 * API version 2026-10, on 2026-11-18; see ADR 0013's Polar addendum):
 *
 * - Webhooks follow Standard Webhooks (`webhook-id`, `webhook-timestamp`,
 *   `webhook-signature`); the body is `{type, timestamp, data}` with the subscription or order
 *   in `data`.
 * - Checkouts are created through the API (POST /v1/checkouts/) with our user id in the
 *   checkout `metadata` (copied to the subscription) and as `external_customer_id`.
 * - Sandbox and production are separate servers with separate secrets: a deployment's mode is
 *   its server (POLAR_SERVER), and events signed with its secret come from that server.
 * - The customer portal is polar.sh/<org>/portal (email code); a signed-in link is made on
 *   demand with POST /v1/customer-sessions/.
 */
export class PolarProvider implements BillingProvider {
  readonly name = "polar" as const;
  private readonly now: () => Date;

  constructor(private readonly config: PolarConfig) {
    this.now = config.now ?? (() => new Date());
  }

  get plans(): readonly Plan[] {
    return PLANS.filter((p) => !!this.config.productIds[p]);
  }

  get testMode(): boolean {
    return this.config.server === "sandbox";
  }

  get portalUrl(): string {
    const host = this.testMode ? "https://sandbox.polar.sh" : "https://polar.sh";
    return `${host}/${encodeURIComponent(this.config.organizationSlug)}/portal`;
  }

  verify(body: string, header: (name: string) => string | null): boolean {
    return verifyPolarSignature({
      secret: this.config.webhookSecret,
      id: header("webhook-id"),
      timestamp: header("webhook-timestamp"),
      signature: header("webhook-signature"),
      body,
      now: this.now(),
    });
  }

  async checkoutUrl(
    plan: Plan,
    userId: string,
    context: { ip?: string | null } = {},
  ): Promise<string | null> {
    const productId = this.config.productIds[plan];
    if (!productId || !USER_ID_PATTERN.test(userId)) return null;
    try {
      const { url } = await this.config.api.createCheckout(
        polarCheckoutRequest({ productId, plan, userId, appUrl: this.config.appUrl, ...context }),
      );
      // We redirect players to it: only an https link is used.
      if (!url.startsWith("https://")) throw new Error("Checkout URL isn't https");
      return url;
    } catch {
      throw new UpstreamUnavailableError(CHECKOUT_DOWN);
    }
  }

  async customerPortalUrl(customerId: string): Promise<string | null> {
    const { customerPortalUrl } = await this.config.api.createCustomerSession({
      customer_id: customerId,
      return_url: `${this.config.appUrl.replace(/\/$/, "")}/account#plan`,
    });
    return customerPortalUrl.startsWith("https://") ? customerPortalUrl : null;
  }

  parse(body: string, header?: (name: string) => string | null): BillingEvent | null {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return null;
    }
    const event = PolarEventSchema.safeParse(json);
    if (!event.success) return null;
    const { type, data } = event.data;
    const delivery = header?.("webhook-id")?.trim();
    // Polar keeps the id across retries; without it, the body identifies the event.
    const eventId =
      delivery && DELIVERY_ID.test(delivery)
        ? `${this.name}:${delivery}`
        : webhookEventId(this.name, body);
    const testMode = this.testMode;

    const other = (subscriptionId: string | null): BillingEvent => ({
      kind: "other",
      eventId,
      eventName: type,
      testMode,
      subscriptionId,
      userId: ourUserId(data.metadata, data.customer?.external_id),
    });

    if (!type.startsWith("subscription.")) return other(data.subscription_id ?? null);

    const sub = PolarSubscriptionSchema.safeParse(data);
    if (!sub.success) return null;
    const s = sub.data;
    const providerUpdatedAt = new Date(s.modified_at ?? s.created_at);
    const state = polarStatus(s, providerUpdatedAt);
    if (!state) return other(s.id);
    const productId = s.product_id ?? s.product?.id ?? null;
    // Only our configured Plus products grant Plus: another product in the same Polar
    // organisation (a free or cheaper one added later) must never unlock it.
    const plan = PLANS.find((p) => productId !== null && this.config.productIds[p] === productId);
    if (!plan) return other(s.id);
    const snapshot: SubscriptionSnapshot = {
      provider: this.name,
      subscriptionId: s.id,
      userId: ourUserId(s.metadata, s.customer?.external_id),
      status: state.status,
      plan,
      variantId: productId,
      customerId: s.customer_id ?? null,
      renewsAt: state.renewsAt,
      endsAt: state.endsAt,
      trialEndsAt: date(s.trial_end),
      providerUpdatedAt,
      testMode,
      // Polar's payloads carry no portal link; one is made on demand (customer sessions).
      portalUrl: null,
    };
    return { kind: "subscription", eventId, eventName: type, testMode, snapshot };
  }
}
