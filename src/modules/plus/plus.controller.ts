import "server-only";
import { NextResponse } from "next/server";
import { ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import { CheckoutBodySchema, ReferralClaimBodySchema } from "./schemas/plus.schema";
import type { BillingWebhookService } from "./services/billing-webhook.service";
import type { PlusService } from "./services/plus.service";
import type { ReferralService } from "./services/referral.service";

/** Provider events are a few KB; anything far bigger isn't one. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

export class PlusController {
  constructor(
    private readonly deps: {
      plus: PlusService;
      webhooks: BillingWebhookService;
      referrals: ReferralService;
    },
  ) {}

  /** GET /api/v1/me/plus: the signed-in player's plan. */
  status = handler({ guard: requireUser }, async ({ user }) =>
    ServiceResponse.success(await this.deps.plus.plan(user.id)).withHeaders({
      "cache-control": "private, no-store",
    }),
  );

  /**
   * POST /api/v1/plus/checkout {plan}: the provider's checkout for a signed-in player, with
   * their user id attached on the server (the only way a purchase is linked to an account).
   * Same-origin only: with Polar it creates a checkout session at the provider, so another
   * site mustn't be able to start one. Answers `{url}`; the page then navigates there. 404
   * when Plus isn't on sale, 409 when they already have it, 503 when the provider is down.
   */
  checkout = handler(
    {
      guard: requireUser,
      rateLimit: { name: "plus:checkout", limit: 20, windowMs: 60_000 },
      body: CheckoutBodySchema,
    },
    async ({ req, user, body }) => {
      const url = await this.deps.plus.checkoutUrl(user.id, body.plan, { ip: clientIp(req) });
      return ServiceResponse.success({ url }, "Checkout ready").withHeaders({
        "cache-control": "private, no-store",
      });
    },
  );

  /**
   * POST /api/v1/plus/trial: starts the signed-in player's free 7-day trial (no card, nothing
   * charged). Same-origin. 404 when Plus isn't on sale, 409 when it's running or was used.
   */
  trial = handler(
    { guard: requireUser, rateLimit: { name: "plus:trial", limit: 10, windowMs: 60_000 } },
    async ({ user }) => {
      const { endsAt } = await this.deps.plus.startTrial(user.id, user.accountId32);
      return ServiceResponse.success({ endsAt: endsAt.toISOString() }, "Trial started").withHeaders(
        { "cache-control": "private, no-store" },
      );
    },
  );

  /**
   * POST /api/v1/plus/referrals/claim {code}: the signed-in friend claims an invite. Same-origin.
   * Answers "rewarded" (a week of Plus each, nothing charged) or "waiting" (until their games are
   * imported). 404 for an unknown code or while Plus isn't on sale; 409 with a reason otherwise.
   */
  claimReferral = handler(
    {
      guard: requireUser,
      rateLimit: { name: "plus:referral", limit: 10, windowMs: 60_000 },
      body: ReferralClaimBodySchema,
    },
    async ({ user, body }) =>
      ServiceResponse.success(
        await this.deps.referrals.claim(user.id, body.code),
        "Invite claimed",
      ).withHeaders({ "cache-control": "private, no-store" }),
  );

  /** GET /api/v1/me/plus/portal: the provider's billing portal (manage, update card, cancel). */
  portal = handler(
    { guard: requireUser, rateLimit: { name: "plus:portal", limit: 20, windowMs: 60_000 } },
    async ({ user }) =>
      withNoStore(NextResponse.redirect(await this.deps.plus.portalUrl(user.id), 303)),
  );

  /**
   * POST /api/v1/plus/webhook: the payment provider's signed events. Its servers call it, so
   * there's no session or Origin; the signature over the raw body is the credential. 404 when
   * no provider is configured. A failure answers 5xx so the provider retries.
   */
  webhook = handler(
    {
      sameOrigin: false,
      rateLimit: { name: "plus:webhook", limit: 300, windowMs: 60_000, byIp: true },
    },
    async ({ req }) => {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES)
        throw new ValidationError("Body too large");
      // The exact bytes received: the signature covers them.
      const body = await req.text();
      if (body.length > MAX_WEBHOOK_BYTES) throw new ValidationError("Body too large");
      const result = await this.deps.webhooks.receive({
        body,
        header: (name) => req.headers.get(name),
      });
      return ServiceResponse.success(result, "Webhook received");
    },
  );
}

/** The buyer's IP as our host saw it (Vercel sets x-forwarded-for), when there is one. */
function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

function withNoStore(res: NextResponse): NextResponse {
  res.headers.set("cache-control", "private, no-store");
  return res;
}
