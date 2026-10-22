import { NotFoundError, UnauthorizedError, ValidationError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import { applySnapshot } from "../domain/subscription";
import type {
  BillingEvent,
  BillingProvider,
  PlusUserLookup,
  SubscriptionsPort,
  WebhookEventsPort,
} from "../plus.ports";
import type { WebhookEventOutcome } from "../plus.model";
import type { WebhookResultDto } from "../dtos/responses/plus.dto";

/** A webhook request as it arrived: the exact body bytes and a header lookup. */
export interface BillingWebhookRequest {
  body: string;
  header: (name: string) => string | null;
}

/**
 * The payment provider's webhooks (ADR 0013), in a fixed order:
 *
 * 1. No provider configured: 404 (the endpoint doesn't exist).
 * 2. The signature over the raw body, before anything is parsed: 401 when it doesn't match.
 * 3. Parse; 400 when it isn't an event we understand.
 * 4. Claim the event id: a retry or a replay of a handled event changes nothing.
 * 5. Apply subscription state unless an event with a newer `updated_at` already did.
 *
 * A purchase is tied to a user only by our id in the checkout's custom data, checked against
 * our users. A subscription without one (or with an unknown id) is stored "unlinked", logged and
 * acknowledged, so the provider stops retrying and the owner can sort it out from the admin page.
 */
export class BillingWebhookService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      provider: BillingProvider | null;
      subscriptions: SubscriptionsPort;
      events: WebhookEventsPort;
      users: PlusUserLookup;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.provider !== null;
  }

  async receive(req: BillingWebhookRequest): Promise<WebhookResultDto> {
    const provider = this.deps.provider;
    if (!provider) throw new NotFoundError("Not found");
    if (!provider.verify(req.body, req.header)) {
      this.deps.logger.warn("billing_webhook_rejected", { reason: "bad_signature" });
      throw new UnauthorizedError("Invalid webhook signature");
    }
    const event = provider.parse(req.body);
    if (!event) throw new ValidationError("Invalid webhook event");

    const now = this.now();
    const subscriptionId =
      event.kind === "subscription" ? event.snapshot.subscriptionId : event.subscriptionId;
    const userId = event.kind === "subscription" ? event.snapshot.userId : event.userId;
    const claimed = await this.deps.events.claim({
      id: event.eventId,
      provider: provider.name,
      eventName: event.eventName,
      subscriptionId,
      userId,
      receivedAt: now,
    });
    if (!claimed) return { outcome: "duplicate" };

    try {
      const { outcome, linkedUser } = await this.handle(provider, event, now);
      await this.deps.events.finish(event.eventId, outcome, linkedUser);
      this.deps.logger.info("billing_webhook_handled", {
        event: event.eventName,
        subscriptionId,
        outcome,
      });
      return { outcome };
    } catch (error) {
      // Let the provider's retry handle it again.
      await this.deps.events.release(event.eventId).catch(() => {});
      throw error;
    }
  }

  private async handle(
    provider: BillingProvider,
    event: BillingEvent,
    now: Date,
  ): Promise<{ outcome: Exclude<WebhookEventOutcome, "processing">; linkedUser?: string | null }> {
    // Test purchases never grant Plus on a live deployment, and the other way round.
    if (event.testMode !== provider.testMode) return { outcome: "mode_mismatch" };
    if (event.kind !== "subscription") return { outcome: "ignored" };

    const { snapshot } = event;
    const user = snapshot.userId ? await this.deps.users.byId(snapshot.userId) : null;
    if (snapshot.userId && !user)
      this.deps.logger.warn("billing_webhook_unknown_user", {
        subscriptionId: snapshot.subscriptionId,
      });
    const existing = await this.deps.subscriptions.find(provider.name, snapshot.subscriptionId);
    const applied = applySnapshot(
      existing,
      snapshot,
      user ? { userId: user.id, accountId32: user.accountId32 } : null,
      now,
    );
    if (applied.kind === "stale") return { outcome: "stale" };
    if ((await this.deps.subscriptions.upsertIfNewer(applied.next)) === "stale")
      return { outcome: "stale" };
    if (!applied.next.userId) {
      this.deps.logger.warn("billing_subscription_unlinked", {
        subscriptionId: snapshot.subscriptionId,
        status: snapshot.status,
      });
      return { outcome: "unlinked", linkedUser: null };
    }
    return { outcome: "applied", linkedUser: applied.next.userId };
  }
}
