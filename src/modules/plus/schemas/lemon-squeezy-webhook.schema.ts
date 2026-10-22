import { z } from "zod";

/**
 * The parts of a Lemon Squeezy webhook we read (everything else is ignored, including the
 * customer's name and email, which we never store). Shapes from
 * https://docs.lemonsqueezy.com/help/webhooks/webhook-requests and
 * https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object.
 */
const isoDate = z.iso.datetime({ offset: true }).or(z.iso.datetime());
const nullableDate = isoDate.nullable().optional();
const id = z.union([z.string().min(1).max(64), z.number().int().nonnegative()]).transform(String);

export const LemonSqueezyMetaSchema = z.object({
  event_name: z.string().min(1).max(100),
  test_mode: z.boolean().optional(),
  /** Checkout custom data (`checkout[custom][user_id]=…`); values come back as strings. */
  custom_data: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const LemonSqueezySubscriptionSchema = z.object({
  type: z.literal("subscriptions"),
  id,
  attributes: z.object({
    status: z.string().min(1).max(40),
    variant_id: id.nullable().optional(),
    customer_id: id.nullable().optional(),
    renews_at: nullableDate,
    ends_at: nullableDate,
    trial_ends_at: nullableDate,
    updated_at: isoDate,
    test_mode: z.boolean().optional(),
    urls: z
      .object({ customer_portal: z.url().max(2000).nullable().optional() })
      .partial()
      .nullable()
      .optional(),
  }),
});

/** Any event: `data` is checked further only when it's a subscription. */
export const LemonSqueezyEventSchema = z.object({
  meta: LemonSqueezyMetaSchema,
  data: z.object({ type: z.string().min(1).max(60), id }).loose(),
});
