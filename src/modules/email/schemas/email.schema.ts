import { z } from "zod";
import { EMAIL_MAX_LENGTH, isEmailAddress, normalizeEmail } from "../domain/email-address";

export const SubscribeEmailSchema = z
  .object({
    email: z
      .string()
      .max(EMAIL_MAX_LENGTH + 20)
      .transform(normalizeEmail)
      .refine(isEmailAddress, "Enter an email address like you@example.com"),
  })
  .strict();

/** Tokens from email links (confirmation and unsubscribe). */
export const EmailTokenQuerySchema = z.object({ token: z.string().min(10).max(500) }).strip();
