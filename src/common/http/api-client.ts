/**
 * Browser-side calls to our API. Unwraps the ServiceResponse envelope: resolves with `data`
 * on success, throws ApiClientError (with the server's message and code) otherwise.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly details?: unknown,
    /** From Retry-After, when the server sent one. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  statusCode: number;
  code?: string;
  details?: unknown;
}

const isEnvelope = (b: unknown): b is Envelope<unknown> =>
  typeof b === "object" && b !== null && "success" in b && "statusCode" in b;

export async function apiRequest<T>(
  url: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  const retry = Number(res.headers.get("retry-after"));
  if (isEnvelope(body)) {
    if (body.success) return body.data as T;
    throw new ApiClientError(
      body.message,
      res.status,
      body.code ?? null,
      body.details,
      retry || undefined,
    );
  }
  if (!res.ok)
    throw new ApiClientError(
      `Request failed (${res.status})`,
      res.status,
      null,
      undefined,
      retry || undefined,
    );
  return body as T;
}
