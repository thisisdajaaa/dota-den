/** Public API of the errors feature (ADR 0009). */
export { errorsController, errorsRepository, errorsService } from "./errors.container";
export type { RecordErrorInput } from "./errors.service";
export type { ErrorGroup } from "./domain/error-event";
