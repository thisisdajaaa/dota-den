import "server-only";
import { handler } from "@/common/http/controller";
import { ServiceResponse } from "@/common/http/service-response";
import type { ErrorsService } from "./errors.service";
import { ReportErrorSchema } from "./schemas/report-error.schema";

export class ErrorsController {
  constructor(private readonly deps: { service: ErrorsService }) {}

  /** POST /api/v1/errors: errors caught by the app's error pages in the browser. */
  report = handler(
    {
      rateLimit: { name: "error-report", limit: 20, windowMs: 60_000 },
      body: ReportErrorSchema,
    },
    async ({ body }) => {
      await this.deps.service.record({ source: "client", kind: "boundary", ...body });
      return ServiceResponse.success(null, "Recorded", 202);
    },
  );
}
