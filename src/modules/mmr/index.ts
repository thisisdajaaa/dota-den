/** Public API of the MMR feature (ADR 0009). Pure calendar helpers live in ./domain. */
export {
  medalHistoryRepository,
  medalService,
  mmrController,
  mmrEntriesRepository,
  mmrInsightsService,
  mmrJournalService,
  screenshotService,
} from "./mmr.container";
export type { MmrEntryDto } from "./dtos/responses/mmr-entry.dto";
