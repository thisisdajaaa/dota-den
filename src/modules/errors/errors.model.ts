import type { ErrorEvent } from "./domain/error-event";

export const ERRORS_COLLECTION = "error_events";
/** Error events are kept for 30 days. */
export const ERROR_RETENTION_S = 30 * 24 * 3600;

export type ErrorEventDocument = ErrorEvent;
