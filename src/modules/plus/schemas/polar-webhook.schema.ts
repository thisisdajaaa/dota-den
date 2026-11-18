import { z } from "zod";

/**
 * The parts of a Polar webhook we read (everything else is ignored, including the customer's
 * name, email and billing address, which we never store). Shapes from Polar's OpenAPI schema,
 * API version 2026-10 (`WebhookSubscriptionUpdatedPayload`, `Subscription`, `Order`), read
 * 2026-11-18: `{type, timestamp, api_version, data}`.
 */
const isoDate = z.iso.datetime({ offset: true });
const nullableDate = isoDate.nullable().optional();
const id = z.string().min(1).max(64);
/** Polar metadata values: strings, numbers or booleans. */
const metadata = z.record(z.string(), z.unknown()).nullable().optional();

export const PolarSubscriptionSchema = z.object({
  id,
  /** incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused. */
  status: z.string().min(1).max(40),
  created_at: isoDate,
  modified_at: nullableDate,
  current_period_end: nullableDate,
  trial_end: nullableDate,
  cancel_at_period_end: z.boolean().optional(),
  ends_at: nullableDate,
  ended_at: nullableDate,
  customer_id: id.nullable().optional(),
  product_id: id.nullable().optional(),
  /** Copied from the checkout's metadata (our `user_id`). */
  metadata,
  customer: z
    .object({ external_id: z.string().max(200).nullable().optional() })
    .loose()
    .nullable()
    .optional(),
  product: z.object({ id: id.optional(), metadata }).loose().nullable().optional(),
});

/** Any event: `data` is checked further only for subscription events. */
export const PolarEventSchema = z.object({
  type: z.string().min(1).max(100),
  timestamp: isoDate.optional(),
  data: z
    .object({
      id: id.optional(),
      subscription_id: id.nullable().optional(),
      metadata,
      customer: z
        .object({ external_id: z.string().max(200).nullable().optional() })
        .loose()
        .nullable()
        .optional(),
    })
    .loose(),
});
