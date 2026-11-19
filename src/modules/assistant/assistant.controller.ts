import "server-only";
import { AppError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { getLocale } from "@/common/i18n/server";
import type { Logger } from "@/common/logging/logger";
import { requireUser } from "@/modules/identity";
import type { AskEventDto } from "./dtos/responses/ask.dto";
import { AskConversationQuerySchema, AskRequestSchema } from "./schemas/ask-tools.schema";
import type { AskService } from "./services/ask.service";

/** Safari holds a streamed response until 1 KB has arrived; a blank first line gets past it. */
const SAFARI_PRIMER = `${" ".repeat(1024)}\n`;

/** Ask Den's API (ADR 0015): the chat's state, a question (streamed), and clearing the chat. */
export class AssistantController {
  constructor(
    private readonly deps: { service: () => AskService; logger: Pick<Logger, "error"> },
  ) {}

  /**
   * GET /api/v1/ask: the player's conversations, the newest one's messages and today's
   * allowance. GET /api/v1/ask?c=<id>: one of their conversations (404 when it isn't theirs).
   */
  state = handler(
    { guard: requireUser, query: AskConversationQuerySchema },
    async ({ user, query }) => {
      const owner = { userId: user.id, accountId32: user.accountId32 };
      const service = this.deps.service();
      return ServiceResponse.success(
        query.c ? await service.conversation(owner, query.c) : await service.state(owner),
      );
    },
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
          // A player who leaves mid-answer closes the stream: the answer still finishes (and
          // the question still counts), it just isn't sent.
          const write = (chunk: string) => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              // Stream closed by the client.
            }
          };
          const send = (event: AskEventDto) => write(`${JSON.stringify(event)}\n`);
          write(SAFARI_PRIMER);
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
            try {
              controller.close();
            } catch {
              // Already closed by the client.
            }
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

  /** DELETE /api/v1/ask?c=<id>: forgets one conversation; ?all=1 forgets all of them. */
  clear = handler(
    { guard: requireUser, query: AskConversationQuerySchema },
    async ({ user, query }) => {
      if (!query.c && query.all !== "1")
        throw new AppError("bad_request", "Say which chat to delete (c) or all=1.");
      await this.deps.service().clear({ userId: user.id, accountId32: user.accountId32 }, query.c);
      return ServiceResponse.success(null, query.c ? "Conversation deleted" : "Chats cleared");
    },
  );
}
