import "server-only";
import { handler } from "@/common/http/controller";
import { getViewerTimeZone } from "@/common/http/request-context";
import { ServiceResponse } from "@/common/http/service-response";
import { requireUser } from "@/modules/identity";
import type { PracticeService } from "./practice.service";
import { UpdatePlanSchema } from "./schemas/update-plan.schema";

export class PracticeController {
  constructor(private readonly deps: { service: PracticeService }) {}

  /** PATCH /api/v1/me/practice-plan: swap a step for another suggestion, or dismiss it. */
  update = handler(
    {
      guard: requireUser,
      rateLimit: { name: "practice:update", limit: 30, windowMs: 60_000 },
      body: UpdatePlanSchema,
      invalidMessage: "Invalid plan change",
    },
    async ({ user, body }) => {
      const { timeZone } = await getViewerTimeZone();
      const view = await this.deps.service.update(
        { userId: user.id, accountId32: user.accountId32 },
        timeZone,
        body,
      );
      return ServiceResponse.success(view, "Plan updated");
    },
  );
}
