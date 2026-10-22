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
