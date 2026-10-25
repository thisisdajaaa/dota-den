/** Public API of the battle report feature (ADR 0009). */
export {
  battleReportService,
  periodReadService,
  replayReadsRepository,
  reportController,
} from "./report.container";
export type { PeriodReadView } from "./services/period-read.service";
export type { PeriodReadDto } from "./dtos/responses/period-read.dto";
export type { BattleReportView, ReportReplaysView } from "./dtos/responses/battle-report.dto";
