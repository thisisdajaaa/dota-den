import type { ErrorEvent, ErrorGroup } from "./domain/error-event";

export interface ErrorsRepositoryPort {
  insert(event: ErrorEvent): Promise<void>;
  /** Distinct errors since `since`, most recent first. */
  groupsSince(since: Date, limit: number): Promise<ErrorGroup[]>;
}
