import type { AppError, ErrorCode } from "@/common/errors/app-error";

/**
 * The one response envelope every API route returns:
 * `{ success, message, data, statusCode }`, plus `code` (and `details`) on failure.
 */
export interface ServiceResponseBody<T> {
  success: boolean;
  message: string;
  data: T | null;
  statusCode: number;
  code?: ErrorCode;
  details?: unknown;
}

export class ServiceResponse<T = unknown> {
  private constructor(
    readonly body: ServiceResponseBody<T>,
    readonly headers: Record<string, string> = {},
  ) {}

  static success<T>(data: T, message = "OK", statusCode = 200): ServiceResponse<T> {
    return new ServiceResponse({ success: true, message, data, statusCode });
  }

  static created<T>(data: T, message = "Created"): ServiceResponse<T> {
    return ServiceResponse.success(data, message, 201);
  }

  static failure(error: AppError): ServiceResponse<null> {
    return new ServiceResponse(
      {
        success: false,
        message: error.message,
        data: null,
        statusCode: error.statusCode,
        code: error.code,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      error.retryAfterSec ? { "retry-after": String(error.retryAfterSec) } : {},
    );
  }

  /** Extra response headers (e.g. Cache-Control). */
  withHeaders(headers: Record<string, string>): ServiceResponse<T> {
    return new ServiceResponse(this.body, { ...this.headers, ...headers });
  }

  get statusCode(): number {
    return this.body.statusCode;
  }
}
