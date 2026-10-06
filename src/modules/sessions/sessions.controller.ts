import "server-only";
import { z } from "zod";
import { NotFoundError } from "@/common/errors/app-error";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import { sessionIdFromParam } from "./domain/session";
import { toSessionNoteDto } from "./dtos/responses/session-note.dto";
import { SessionGapInputSchema, SessionNoteInputSchema } from "./schemas/sessions.schema";
import type { DashboardFact } from "@/modules/matches/domain/read-models";
import type { SessionService } from "./sessions.service";

/** Note saves allowed per user per minute. */
const NOTE_SAVES_PER_MINUTE = 30;
/** Gap setting changes allowed per user per minute. */
const GAP_CHANGES_PER_MINUTE = 20;
const NO_STORE = { "cache-control": "private, no-store" };

const SessionParamsSchema = z.object({ sessionId: z.string().max(64) });

export class SessionsController {
  constructor(private readonly deps: { service: SessionService<DashboardFact> }) {}

  /** GET /api/v1/me/settings/session-gap: your session break length, in minutes. */
  getGap = handler({ guard: requireUser }, async ({ user }) =>
    ServiceResponse.success({
      gapMinutes: await this.deps.service.gap({ userId: user.id, accountId32: user.accountId32 }),
    }).withHeaders(NO_STORE),
  );

  /** PUT /api/v1/me/settings/session-gap: how long a break splits two sessions. */
  setGap = handler(
    {
      guard: requireUser,
      rateLimit: { name: "session-gap", limit: GAP_CHANGES_PER_MINUTE, windowMs: 60_000 },
      body: SessionGapInputSchema,
      invalidMessage: "Pick a valid gap",
    },
    async ({ user, body }) => {
      await this.deps.service.setGap(
        { userId: user.id, accountId32: user.accountId32 },
        body.gapMinutes,
      );
      return ServiceResponse.success({ gapMinutes: body.gapMinutes }, "Session break saved");
    },
  );

  /** PUT /api/v1/sessions/:sessionId/notes: your note and goal for one of your sessions. */
  saveNote = handler(
    {
      guard: requireUser,
      rateLimit: { name: "session-notes", limit: NOTE_SAVES_PER_MINUTE, windowMs: 60_000 },
      params: SessionParamsSchema,
      body: SessionNoteInputSchema,
      invalidMessage: "Check the highlighted fields",
    },
    async ({ user, params, body }) => {
      const sessionId = sessionIdFromParam(params.sessionId);
      if (!sessionId) throw new NotFoundError("Session not found");
      const res = await this.deps.service.saveNote(
        { userId: user.id, accountId32: user.accountId32 },
        sessionId,
        body,
      );
      // Another account's session is indistinguishable from a missing one.
      if (!res.ok) throw new NotFoundError("Session not found");
      return ServiceResponse.success(toSessionNoteDto(res.value), "Session notes saved");
    },
  );
}
