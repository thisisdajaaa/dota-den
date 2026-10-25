/** Public API of the matches feature (ADR 0009). Read-model types live in ./domain. */
export {
  autoReviewService,
  matchCoachService,
  matchesController,
  matchExtrasService,
  matchesService,
  matchFactsRepository,
  matchQueries,
  matchSyncService,
  openDotaAdapter,
  syncStatesRepository,
} from "./matches.container";
export {
  BACKFILL_COOLDOWN_MS,
  MatchSyncService,
  SYNC_COOLDOWN_MS,
} from "./services/match-sync.service";
export type { ExtrasRun, MatchExtrasService } from "./services/match-extras.service";
export type { MatchQueries, MatchDetailProvider, ImportedPlayerMatch } from "./matches.ports";
export type { CoachViewDto, CoachResultDto } from "./dtos/responses/coach.dto";
