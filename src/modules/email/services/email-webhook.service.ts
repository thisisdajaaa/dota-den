import { NotFoundError, UnauthorizedError, ValidationError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import { deliveryStop } from "../domain/delivery-events";
import { maskEmail } from "../domain/email-address";
import { verifyWebhookSignature } from "../domain/webhook-signature";
import type { EmailSubscriptionsPort, EmailWebhookEventsPort } from "../email.ports";
import type { WebhookOutcomeDto } from "../dtos/responses/email-status.dto";
import { ResendWebhookEventSchema } from "../schemas/resend-webhook.schema";

/** A signed webhook request as it arrived (the body exactly as received). */
export interface WebhookRequest {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
}

/**
 * Resend's delivery webhooks: a hard bounce or a spam complaint stops the weekly email to that
 * address. Only requests signed with RESEND_WEBHOOK_SECRET count, and each message is handled
 * once (Svix retries carry the same id).
 */
export class EmailWebhookService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      subscriptions: EmailSubscriptionsPort;
      events: EmailWebhookEventsPort;
      /** `whsec_…`; null when RESEND_WEBHOOK_SECRET isn't set: the endpoint doesn't exist. */
      secret: string | null;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.secret !== null;
  }

  async receive(req: WebhookRequest): Promise<WebhookOutcomeDto> {
    const { secret } = this.deps;
    if (!secret) throw new NotFoundError("Not found");
    const now = this.now();
    const failure = verifyWebhookSignature({ secret, ...req, now });
    if (failure) {
      this.deps.logger.warn("email_webhook_rejected", { reason: failure });
      throw new UnauthorizedError("Invalid webhook signature");
    }

    let json: unknown;
    try {
      json = JSON.parse(req.body);
    } catch {
      throw new ValidationError("Body must be JSON");
    }
    const parsed = ResendWebhookEventSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError("Invalid webhook event");
    const event = parsed.data;

    // Signed, so the id is Svix's own; claim it so a retry isn't handled twice.
    const id = req.id!;
    if (!(await this.deps.events.claim(id, event.type, now))) return { outcome: "duplicate" };
    try {
      const stop = deliveryStop(event);
      if (!stop) return { outcome: "ignored" };
      let stopped = 0;
      for (const address of stop.recipients) {
        const changed = await this.deps.subscriptions.stopAddress(address, stop.reason, now);
        stopped += changed;
        this.deps.logger.info("email_address_stopped", {
          reason: stop.reason,
          to: maskEmail(address),
          subscriptions: changed,
        });
      }
      return { outcome: "processed", stopped };
    } catch (error) {
      // Let Svix's retry handle it again.
      await this.deps.events.release(id).catch(() => {});
      throw error;
    }
  }
}
