/** Public API of the patches feature (ADR 0009). */
export {
  patchImportService,
  patchesController,
  patchesRepository,
  patchesService,
  patchReadRepository,
  patchWatchlistService,
} from "./patches.container";
export type { PatchDigest } from "./domain/digest";
