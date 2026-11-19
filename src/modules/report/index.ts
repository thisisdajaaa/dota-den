/** Public API of the battle report feature (ADR 0009). */
export {
  battleReportService,
  periodReadService,
  replayReadsRepository,
  reportController,
  weeklyCoachService,
} from "./report.container";
export type { WeeklyCoachView } from "./services/weekly-coach.service";
export type {
  CoachNoteDto,
  WeeklyCoachInitial,
  WeeklyCoachWriteDto,
} from "./dtos/responses/weekly-coach.dto";
export { toCoachNoteDto } from "./dtos/responses/weekly-coach.dto";
export type { PeriodReadView } from "./services/period-read.service";
export type { PeriodReadDto } from "./dtos/responses/period-read.dto";
export type { BattleReportView, ReportReplaysView } from "./dtos/responses/battle-report.dto";
