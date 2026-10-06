/** Public API of the together feature (ADR 0009). */
export { friendsService, SHARED_MATCH_LIMIT, togetherService } from "./together.container";
export type {
  PairAnalysis,
  TogetherCandidates,
  TogetherOverview,
} from "./dtos/responses/together.dto";
export type { TeammatesOverview, TeammateView } from "./dtos/responses/together-views.dto";
