import "server-only";
import { handler } from "@/common/http/controller";
import { getViewerTimeZone } from "@/common/http/request-context";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import type { GoalsService } from "./goals.service";
import { UpdateGoalsSchema } from "./schemas/update-goals.schema";

export class GoalsController {
  constructor(private readonly deps: { service: GoalsService }) {}

  /** PUT /api/v1/me/goals: set this week's goals. */
  update = handler(
    {
      guard: requireUser,
      rateLimit: { name: "goals:save", limit: 30, windowMs: 60_000 },
      body: UpdateGoalsSchema,
    },
    async ({ user, body }) => {
      const { timeZone } = await getViewerTimeZone();
      const saved = await this.deps.service.saveThisWeek(
        { userId: user.id, accountId32: user.accountId32 },
        body.goals,
        timeZone,
      );
      return ServiceResponse.success(saved, "Goals saved");
    },
  );
}
