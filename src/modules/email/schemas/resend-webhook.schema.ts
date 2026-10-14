import { z } from "zod";

/**
 * A Resend webhook event, only the fields we read. Unknown fields are kept out; unknown event
 * types are still valid (they're acknowledged and ignored).
 */
export const ResendWebhookEventSchema = z.object({
  type: z.string().min(1).max(100),
  created_at: z.string().max(100).optional(),
  data: z
    .object({
      to: z.union([z.array(z.string().max(400)).max(100), z.string().max(400)]).optional(),
      bounce: z.object({ type: z.string().max(100).nullish() }).nullish(),
    })
    .nullish(),
});
