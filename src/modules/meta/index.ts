/** Public API of the meta feature (ADR 0009). Pure helpers live in ./domain. */
export { metaService, metaSource } from "./meta.container";
export type { LatestPatchResult, SourceError as MetaSourceError } from "./meta.ports";
