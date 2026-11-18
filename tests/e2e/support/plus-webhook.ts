import { createHmac } from "node:crypto";

/** The Lemon Squeezy webhook secret the E2E server runs with (a throwaway test value). */
export const E2E_PLUS_WEBHOOK_SECRET = "dota-den-e2e-lemonsqueezy-secret-0001";

/** Checkout links of the fake store (tests read the redirect; nothing follows it). */
export const E2E_PLUS_CHECKOUT = {
  monthly: "https://dota-den-e2e.lemonsqueezy.com/buy/monthly-variant",
  yearly: "https://dota-den-e2e.lemonsqueezy.com/buy/yearly-variant",
};

/**
 * Headers Lemon Squeezy would send for `body`: X-Signature is the HMAC-SHA256 hex digest of the
 * raw body (written independently of the app's code, from Lemon Squeezy's docs).
 */
export function lemonSqueezyHeaders(
  body: string,
  event: string,
  secret = E2E_PLUS_WEBHOOK_SECRET,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-event-name": event,
    "x-signature": createHmac("sha256", secret).update(body).digest("hex"),
  };
}

/** A subscription event body shaped like Lemon Squeezy's documented payloads. */
export function subscriptionEvent(opts: {
  event: string;
  subscriptionId: string;
  userId: string;
  status: string;
  updatedAt: Date;
  renewsAt?: Date | null;
  endsAt?: Date | null;
}): string {
  return JSON.stringify({
    meta: { event_name: opts.event, custom_data: { user_id: opts.userId } },
    data: {
      type: "subscriptions",
      id: opts.subscriptionId,
      attributes: {
        store_id: 1,
        customer_id: 4242,
        variant_id: 501,
        user_name: "E2E Buyer",
        user_email: "buyer@e2e.example",
        status: opts.status,
        renews_at: (opts.renewsAt ?? null)?.toISOString() ?? null,
        ends_at: (opts.endsAt ?? null)?.toISOString() ?? null,
        trial_ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: opts.updatedAt.toISOString(),
        test_mode: false,
        urls: {
          update_payment_method: "https://dota-den-e2e.lemonsqueezy.com/subscription/1/payment",
          customer_portal: "https://dota-den-e2e.lemonsqueezy.com/billing?expires=1&signature=e2e",
        },
      },
    },
  });
}

// ---- Polar (ADR 0013, Polar addendum) -----------------------------------------------------

/** The Polar webhook secret the Polar E2E server runs with (Standard Webhooks, test value). */
export const E2E_POLAR_WEBHOOK_KEY = Buffer.from("dota-den-e2e-polar-signing-key-01");
export const E2E_POLAR_WEBHOOK_SECRET = `whsec_${E2E_POLAR_WEBHOOK_KEY.toString("base64")}`;
/** The Polar E2E server's products (any UUIDs; the fake API accepts them). */
export const E2E_POLAR_PRODUCTS = {
  monthly: "11111111-1111-4111-8111-111111111111",
  yearly: "22222222-2222-4222-8222-222222222222",
};

let polarDelivery = 0;

/**
 * Headers Polar would send for `body` (Standard Webhooks, written independently of the app's
 * code from the spec): `webhook-signature` is `v1,` + base64 HMAC-SHA256 of
 * `${id}.${timestamp}.${body}` under the base64-decoded secret.
 */
export function polarHeaders(
  body: string,
  opts: { id?: string; timestamp?: number; key?: Buffer } = {},
): Record<string, string> {
  const id = opts.id ?? `msg_e2e_${process.pid}_${Date.now()}_${++polarDelivery}`;
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const mac = createHmac("sha256", opts.key ?? E2E_POLAR_WEBHOOK_KEY)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": ts,
    "webhook-signature": `v1,${mac}`,
  };
}

/** A Polar subscription event body shaped like the 2026-10 `Subscription` schema. */
export function polarSubscriptionEvent(opts: {
  type: string;
  subscriptionId: string;
  userId: string;
  status: string;
  modifiedAt: Date;
  periodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  endsAt?: Date | null;
  endedAt?: Date | null;
  productId?: string;
}): string {
  const productId = opts.productId ?? E2E_POLAR_PRODUCTS.monthly;
  return JSON.stringify({
    type: opts.type,
    timestamp: opts.modifiedAt.toISOString(),
    api_version: "2026-10",
    data: {
      created_at: new Date(opts.modifiedAt.getTime() - 60_000).toISOString(),
      modified_at: opts.modifiedAt.toISOString(),
      id: opts.subscriptionId,
      amount: 29900,
      currency: "php",
      recurring_interval: "month",
      recurring_interval_count: 1,
      status: opts.status,
      current_period_start: new Date().toISOString(),
      current_period_end: opts.periodEnd.toISOString(),
      trial_start: null,
      trial_end: null,
      cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
      canceled_at: null,
      started_at: new Date().toISOString(),
      ends_at: opts.endsAt?.toISOString() ?? null,
      ended_at: opts.endedAt?.toISOString() ?? null,
      customer_id: "9d1b8c4e-3a2f-4e5d-8c7b-6a5f4e3d2c1b",
      product_id: productId,
      discount_id: null,
      checkout_id: null,
      metadata: { user_id: opts.userId, plan: "monthly" },
      customer: {
        id: "9d1b8c4e-3a2f-4e5d-8c7b-6a5f4e3d2c1b",
        external_id: opts.userId,
        email: "polar-buyer@e2e.example",
        name: "E2E Polar Buyer",
      },
      product: { id: productId, name: "Dota Den Plus (monthly)", metadata: { plan: "monthly" } },
    },
  });
}
