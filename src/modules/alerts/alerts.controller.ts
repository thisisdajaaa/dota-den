import "server-only";
import { handler } from "@/common/http/controller";
import { requireCron } from "@/common/http/cron-auth";
import { ServiceResponse } from "@/common/http/service-response";
import { OpsReportSchema } from "./schemas/ops-report.schema";
import type { OpsMonitorService } from "./services/ops-monitor.service";

export class AlertsController {
  constructor(private readonly deps: { monitor: OpsMonitorService }) {}

  /**
   * POST /api/cron/backup-report: the backup and restore-drill workflows (GitHub Actions)
   * report their outcome with the cron bearer secret. A failure alerts the owner.
   */
  opsReport = handler(
    {
      guard: requireCron,
      // Called by a workflow, not a browser: the bearer secret is the protection.
      sameOrigin: false,
      body: OpsReportSchema,
      invalidMessage: "Invalid report",
    },
    async ({ body }) =>
      ServiceResponse.success(await this.deps.monitor.recordReport(body), "Report recorded"),
  );
}
