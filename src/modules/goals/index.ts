/** Public API of the goals feature (ADR 0009). */
export { goalsController, goalsRepository, goalsService } from "./goals.container";
export type { WeeklyGoalsViewDto, SavedGoalsDto } from "./dtos/responses/weekly-goals.dto";
