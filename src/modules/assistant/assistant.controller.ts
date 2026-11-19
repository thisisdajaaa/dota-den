import "server-only";
import { AppError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { getLocale } from "@/common/i18n/server";
import type { Logger } from "@/common/logging/logger";
import { requireUser } from "@/modules/identity";
import type { AskEventDto } from "./dtos/responses/ask.dto";
import { AskRequestSchema } from "./schemas/ask-tools.schema";
import type { AskService } from "./services/ask.service";

/** Safari holds a streamed response until 1 KB has arrived; a blank first line gets past it. */
const SAFARI_PRIMER = `${" ".repeat(1024)}\n`;

/** Ask Den's API (ADR 0015): the chat's state, a question (streamed), and clearing the chat. */
export class AssistantController {
  constructor(
    private readonly deps: { service: () => AskService; logger: Pick<Logger, "error"> },
  ) {}

  /** GET /api/v1/ask: the remembered chat and today's allowance. */
  state = handler({ guard: requireUser }, async ({ user }) =>
    ServiceResponse.success(
      await this.deps.service().state({ userId: user.id, accountId32: user.accountId32 }),
    ),
  );

  /**
   * POST /api/v1/ask: answers a question. Refusals (signed out, rate limit, today's questions
   * used up, Ask Den off) are ordinary error envelopes; once a question is taken, the reply is
   * streamed as NDJSON: `status` lines while tools run, then one `answer` or `error` line.
   */
  ask = handler(
    {
      guard: requireUser,
      // Against abuse; the daily allowance is the real limit.
      rateLimit: { name: "ask", limit: 6, windowMs: 60_000 },
      body: AskRequestSchema,
      invalidMessage: "Invalid question",
    },
    async ({ user, body }) => {
      const service = this.deps.service();
      const ticket = await service.reserve({ userId: user.id, accountId32: user.accountId32 });
      const locale = await getLocale();
      const encoder = new TextEncoder();
      const logger = this.deps.logger;
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: AskEventDto) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          controller.enqueue(encoder.encode(SAFARI_PRIMER));
          try {
            const data = await service.answer(ticket, body, locale, send);
            send({ type: "answer", data });
          } catch (e) {
            if (e instanceof AppError) {
              const reason = (e.details as { reason?: string } | undefined)?.reason ?? e.code;
              send({ type: "error", reason, message: e.message });
            } else {
              logger.error("ask_failed", { error: e });
              send({ type: "error", reason: "internal", message: "Something went wrong." });
            }
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "no-store",
          "x-accel-buffering": "no",
        },
      });
    },
  );

  /** DELETE /api/v1/ask: forgets the chat. */
  clear = handler({ guard: requireUser }, async ({ user }) => {
    await this.deps.service().clear({ userId: user.id, accountId32: user.accountId32 });
    return ServiceResponse.success(null, "Chat cleared");
  });
}
