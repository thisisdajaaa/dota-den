import "server-only";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import type { AnnotationsService } from "./annotations.service";
import { MatchIdParamsSchema, SaveAnnotationSchema } from "./schemas/save-annotation.schema";

export class AnnotationsController {
  constructor(private readonly deps: { service: AnnotationsService }) {}

  /** PUT /api/v1/me/matches/:matchId/annotation */
  save = handler(
    {
      guard: requireUser,
      rateLimit: { name: "annotation:save", limit: 60, windowMs: 60_000 },
      params: MatchIdParamsSchema,
      body: SaveAnnotationSchema,
    },
    async ({ user, params, body }) =>
      ServiceResponse.success(
        await this.deps.service.save(
          { userId: user.id, accountId32: user.accountId32 },
          params.matchId,
          body,
        ),
        "Saved",
      ),
  );
}
