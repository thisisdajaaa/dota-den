import type { z } from "zod";
import type { OpsReportSchema } from "../../schemas/ops-report.schema";

export type OpsReportRequestDto = z.infer<typeof OpsReportSchema>;
