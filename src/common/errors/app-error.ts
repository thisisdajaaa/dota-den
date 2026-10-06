/**
 * Errors a service raises for failures the caller should see (bad input, not found, a
 * conflict, an upstream outage). Controllers turn them into a ServiceResponse with the
 * matching status; anything else is a bug and surfaces as a 500.
 */

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "upstream_unavailable"
  | "internal";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  upstream_unavailable: 503,
  internal: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    /** Seconds the client should wait before retrying (sent as Retry-After). */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }

  get statusCode(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super("bad_request", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not signed in") {
    super("unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not allowed") {
    super("forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", details?: unknown) {
    super("not_found", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("conflict", message, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Try again in a minute.", retryAfterSec?: number) {
    super("rate_limited", message, undefined, retryAfterSec);
  }
}

export class UpstreamUnavailableError extends AppError {
  constructor(
    message = "A data source is unavailable right now. Try again shortly.",
    retryAfterSec?: number,
  ) {
    super("upstream_unavailable", message, undefined, retryAfterSec);
  }
}
