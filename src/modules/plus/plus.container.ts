import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { usersService } from "@/modules/identity";
import { USER_ID_PATTERN } from "./domain/plans";
import { LemonSqueezyProvider } from "./infrastructure/lemon-squeezy-provider";
import { PlusController } from "./plus.controller";
import type { BillingProvider } from "./plus.ports";
import { SubscriptionsRepository } from "./repositories/subscriptions.repository";
import { WebhookEventsRepository } from "./repositories/webhook-events.repository";
import { BillingWebhookService } from "./services/billing-webhook.service";
import { PlusService } from "./services/plus.service";

export const subscriptionsRepository = new SubscriptionsRepository(getDb);
export const webhookEventsRepository = new WebhookEventsRepository(getDb);

/** The configured payment provider, or null: without it Plus doesn't exist (ADR 0013). */
function billingProvider(): BillingProvider | null {
  const e = env();
  if (e.BILLING_PROVIDER !== "lemonsqueezy" || !e.LEMONSQUEEZY_WEBHOOK_SECRET) return null;
  return new LemonSqueezyProvider({
    webhookSecret: e.LEMONSQUEEZY_WEBHOOK_SECRET,
    checkoutUrls: {
      monthly: e.LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
      yearly: e.LEMONSQUEEZY_CHECKOUT_URL_YEARLY,
    },
    storeUrl: e.LEMONSQUEEZY_STORE_URL ?? null,
    variantIds: {
      monthly: e.LEMONSQUEEZY_VARIANT_ID_MONTHLY,
      yearly: e.LEMONSQUEEZY_VARIANT_ID_YEARLY,
    },
    testMode: e.LEMONSQUEEZY_TEST_MODE,
  });
}

const provider = lazy(() => ({ current: billingProvider() }));

export const plusService = lazy(
  () =>
    new PlusService({
      subscriptions: subscriptionsRepository,
      events: webhookEventsRepository,
      provider: provider.current,
      enabled: () => env().PLUS_ENABLED,
      logger,
    }),
);

export const billingWebhooks = lazy(
  () =>
    new BillingWebhookService({
      provider: provider.current,
      subscriptions: subscriptionsRepository,
      events: webhookEventsRepository,
      users: {
        byId: async (id) => {
          if (!USER_ID_PATTERN.test(id)) return null;
          const [user] = await usersService.findByIds([id]);
          return user ? { id: user.id, accountId32: user.accountId32 } : null;
        },
      },
      logger,
    }),
);

export const plusController = new PlusController({ plus: plusService, webhooks: billingWebhooks });
