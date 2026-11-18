/**
 * A small client for the Polar API calls we make: checkout and customer portal sessions (the
 * app) and products and webhook endpoints (scripts/polar-provision.ts). Requests are pinned
 * to one API version (`Polar-Version`), carry the organization access token, and time out; failures become `PolarApiError` without the
 * response body (it can echo what we sent). See https://polar.sh/docs/api-reference.
 */

/** The API version requests are pinned to (also the webhook endpoint's `api_version`). */
export const POLAR_API_VERSION = "2026-10";

export type PolarServer = "production" | "sandbox";

export const POLAR_API_BASE: Record<PolarServer, string> = {
  production: "https://api.polar.sh",
  sandbox: "https://sandbox-api.polar.sh",
};

export class PolarApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null when the request didn't complete (timeout, network). */
    readonly status: number | null,
  ) {
    super(message);
    this.name = "PolarApiError";
  }
}

export interface PolarApiConfig {
  accessToken: string;
  server: PolarServer;
  /** Overrides the server's base URL (tests point it at a local fake). */
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class PolarApiClient {
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: PolarApiConfig) {
    this.base = (config.baseUrl ?? POLAR_API_BASE[config.server]).replace(/\/$/, "");
    this.fetch = config.fetch ?? fetch;
  }

  /** POST /v1/checkouts/: a checkout session; its `url` is where the buyer pays. */
  createCheckout(body: Record<string, unknown>): Promise<{ id: string; url: string }> {
    return this.send("POST", "/v1/checkouts/", body, (json) => {
      const { id, url } = json as { id?: unknown; url?: unknown };
      return typeof id === "string" && typeof url === "string" ? { id, url } : null;
    });
  }

  /** POST /v1/customer-sessions/: a short-lived, signed-in link to the customer portal. */
  createCustomerSession(body: Record<string, unknown>): Promise<{ customerPortalUrl: string }> {
    return this.send("POST", "/v1/customer-sessions/", body, (json) => {
      const url = (json as { customer_portal_url?: unknown }).customer_portal_url;
      return typeof url === "string" ? { customerPortalUrl: url } : null;
    });
  }

  /** Any other call (the provisioning script lists and creates products and webhooks). */
  request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.send(method, path, body, (json) => json as Record<string, unknown>);
  }

  private async send<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body: Record<string, unknown> | undefined,
    read: (json: unknown) => T | null,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.fetch(`${this.base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.config.accessToken}`,
          ...(body ? { "content-type": "application/json" } : {}),
          accept: "application/json",
          "polar-version": POLAR_API_VERSION,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 8_000),
        cache: "no-store",
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      throw new PolarApiError(timeout ? "Polar API timed out" : "Polar API unreachable", null);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new PolarApiError(`Polar API answered ${res.status}`, res.status);
    }
    const json: unknown = await res.json().catch(() => null);
    const value = json && typeof json === "object" ? read(json) : null;
    if (!value) throw new PolarApiError("Unexpected Polar API response", res.status);
    return value;
  }
}
