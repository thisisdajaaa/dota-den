import { z } from "zod";
import { NOTIFICATION_KINDS } from "../domain/notification";

/** What PushManager.subscribe() returns (toJSON()), as the browser sends it. */
export const SubscribeSchema = z
  .object({
    endpoint: z.url().startsWith("https://").max(1000),
    keys: z
      .object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })
      .strip(),
    expirationTime: z.number().nullable().optional(),
  })
  .strip();

export const UnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1000) }).strict();

/** Every kind is optional: one left out keeps its current setting. */
export const PrefsSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, z.boolean().optional()])) as Record<
      (typeof NOTIFICATION_KINDS)[number],
      z.ZodOptional<z.ZodBoolean>
    >,
  )
  .strict()
  .refine((p) => Object.values(p).some((v) => v !== undefined), "Nothing to save");
