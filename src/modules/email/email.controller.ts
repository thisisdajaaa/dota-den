import "server-only";
import { ValidationError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { getLocale } from "@/common/i18n/server";
import { requireUser } from "@/modules/identity";
import { EmailTokenQuerySchema, SubscribeEmailSchema } from "./schemas/email.schema";
import type { EmailService } from "./services/email.service";
import type { EmailWebhookService } from "./services/email-webhook.service";
import type { TokenOutcomeDto } from "./dtos/responses/email-status.dto";

/** Resend's events are a few KB; anything far bigger isn't one. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

export class EmailController {
  constructor(private readonly deps: { service: EmailService; webhooks: EmailWebhookService }) {}

  /** PUT /api/v1/me/email: start (or restart) the double opt-in for an address. */
  subscribe = handler(
    {
      guard: requireUser,
      rateLimit: { name: "email:subscribe", limit: 5, windowMs: 10 * 60_000 },
      body: SubscribeEmailSchema,
      invalidMessage: "Enter an email address like you@example.com",
    },
    async ({ user, body }) => {
      const language = user.settings.language ?? (await getLocale());
      const status = await this.deps.service.subscribe(user.id, body.email, language);
      return ServiceResponse.success(
        status,
        status.status === "confirmed" ? "Weekly email on" : "Confirmation email sent",
      );
    },
  );

  /** DELETE /api/v1/me/email: stop the weekly email and forget the address. */
  remove = handler(
    {
      guard: requireUser,
      rateLimit: { name: "email:remove", limit: 10, windowMs: 60_000 },
    },
    async ({ user }) =>
      ServiceResponse.success(await this.deps.service.remove(user.id), "Weekly email off"),
  );

  /** POST /api/v1/me/email/test: a sample email to the player's own confirmed address. */
  sendTest = handler(
    {
      guard: requireUser,
      rateLimit: { name: "email:test", limit: 3, windowMs: 10 * 60_000 },
    },
    async ({ user }) => {
      await this.deps.service.sendTest(user.id, user.settings.language ?? (await getLocale()));
      return ServiceResponse.success({ sent: true }, "Test email sent");
    },
  );

  /** POST /api/v1/email/confirm?token=…: the confirmation page's button (signed-out is fine). */
  confirm = handler(
    {
      rateLimit: { name: "email:confirm", limit: 20, windowMs: 60_000, byIp: true },
      query: EmailTokenQuerySchema,
    },
    async ({ query }) => {
      const outcome = await this.deps.service.confirm(query.token);
      return ServiceResponse.success<TokenOutcomeDto>(
        { outcome },
        outcome === "confirmed" ? "Email confirmed" : "Link invalid or expired",
      );
    },
  );

  /**
   * POST /api/v1/email/unsubscribe?token=…: the unsubscribe page's button, and RFC 8058
   * one-click unsubscribe (mail apps POST `List-Unsubscribe=One-Click` from their own servers,
   * so there's no Origin to check). The signed token is the only credential needed.
   */
  unsubscribe = handler(
    {
      sameOrigin: false,
      rateLimit: { name: "email:unsubscribe", limit: 30, windowMs: 60_000, byIp: true },
      query: EmailTokenQuerySchema,
    },
    async ({ query }) => {
      const outcome = await this.deps.service.unsubscribe(query.token);
      return ServiceResponse.success<TokenOutcomeDto>(
        { outcome },
        outcome === "unsubscribed" ? "Unsubscribed" : "Link invalid",
      );
    },
  );

  /**
   * POST /api/v1/email/webhook: Resend's delivery events (signed with Svix). A hard bounce or a
   * spam complaint stops the weekly email to that address. Resend's servers call it, so there's
   * no session or Origin; the signature over the raw body is the credential. 404 when
   * RESEND_WEBHOOK_SECRET isn't set. A failure answers 5xx so Resend retries.
   */
  webhook = handler(
    {
      sameOrigin: false,
      rateLimit: { name: "email:webhook", limit: 300, windowMs: 60_000, byIp: true },
    },
    async ({ req }) => {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BYTES)
        throw new ValidationError("Body too large");
      // The exact bytes received: the signature covers them.
      const body = await req.text();
      if (body.length > MAX_WEBHOOK_BYTES) throw new ValidationError("Body too large");
      const result = await this.deps.webhooks.receive({
        id: req.headers.get("svix-id"),
        timestamp: req.headers.get("svix-timestamp"),
        signature: req.headers.get("svix-signature"),
        body,
      });
      return ServiceResponse.success(result, "Webhook received");
    },
  );
}
