import { isEmailAddress, normalizeEmail } from "./email-address";

/**
 * What a provider's delivery event means for a subscription (pure). Only a hard bounce or a
 * spam complaint stops the weekly email; everything else (delivered, opened, a temporary
 * bounce such as a full mailbox) changes nothing.
 */

/** Why we stopped sending to an address. The player has to enter an address again. */
export type StopReason = "bounced" | "complained";

/** The parts of a Resend webhook event we read (see schemas/resend-webhook.schema.ts). */
export interface DeliveryEvent {
  type: string;
  data?: {
    to?: readonly string[] | string;
    bounce?: { type?: string | null } | null;
  } | null;
}

export interface DeliveryStop {
  reason: StopReason;
  /** Normalised recipient addresses. Personal data: never log them in full. */
  recipients: string[];
}

/** "Name <a@b.c>" or "a@b.c" → "a@b.c" (normalised), or null when it isn't an address. */
export function recipientAddress(raw: string): string | null {
  const m = /<([^<>]+)>\s*$/.exec(raw);
  const address = normalizeEmail(m ? m[1] : raw);
  return isEmailAddress(address) ? address : null;
}

/**
 * The stop an event calls for, or null. A bounce counts only when it's permanent (Resend's
 * `bounce.type` "Permanent"); one without a type is treated as permanent, since Resend sends
 * `email.bounced` when the receiving server rejected the email for good.
 */
export function deliveryStop(event: DeliveryEvent): DeliveryStop | null {
  let reason: StopReason;
  if (event.type === "email.complained") reason = "complained";
  else if (event.type === "email.bounced") {
    const kind = event.data?.bounce?.type?.trim().toLowerCase();
    if (kind && kind !== "permanent") return null;
    reason = "bounced";
  } else return null;

  const to = event.data?.to;
  const list = typeof to === "string" ? [to] : (to ?? []);
  const recipients = [
    ...new Set(list.map(recipientAddress).filter((a): a is string => a !== null)),
  ];
  return recipients.length > 0 ? { reason, recipients } : null;
}
