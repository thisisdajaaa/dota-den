import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { env } from "@/common/config/env";
import {
  AppError,
  ForbiddenError,
  RateLimitedError,
  ValidationError,
} from "@/common/errors/app-error";
import { clientKey, rateLimit } from "./rate-limit";
import { ServiceResponse } from "./service-response";

/** Resolves who is calling; throws UnauthorizedError/ForbiddenError to refuse. */
export type Guard<U> = (req: NextRequest) => Promise<U>;

export interface RateLimitPolicy {
  /** Bucket name, e.g. "goals:save". The caller's user id (or IP) is appended. */
  name: string;
  limit: number;
  windowMs: number;
  /** Count in this instance only (cheap, for high-rate polling). */
  local?: boolean;
  /** Key by client IP even when signed in (e.g. limits shared by guests and users). */
  byIp?: boolean;
}

export interface HandlerOptions<U, B, Q, P> {
  /** Who may call. Omit for public endpoints. */
  guard?: Guard<U>;
  /** Mutations from another origin are refused (CSRF defence). Defaults to true for non-GET. */
  sameOrigin?: boolean;
  /** A policy, or a function returning one (for limits read from the environment). */
  rateLimit?: RateLimitPolicy | (() => RateLimitPolicy);
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
  /** Message for a body that fails validation (field errors go in `details`). */
  invalidMessage?: string;
}

export interface HandlerContext<U, B, Q, P> {
  req: NextRequest;
  user: U;
  body: B;
  query: Q;
  params: P;
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/** CSRF defence for cookie-authenticated mutations (in addition to SameSite=Lax). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(env().APP_URL).origin;
}

export function toNextResponse(res: ServiceResponse): NextResponse {
  return NextResponse.json(res.body, { status: res.statusCode, headers: res.headers });
}

function parse<T>(schema: ZodType<T> | undefined, value: unknown, message: string): T {
  if (!schema) return undefined as T;
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(message, z.flattenError(r.error));
  return r.data;
}

/**
 * Builds a route handler with the steps every endpoint shares, in a fixed order:
 * same-origin check → guard → rate limit → validate params, query and body → run the
 * action → wrap the result in the ServiceResponse envelope. AppErrors become failure
 * envelopes; anything else is rethrown so Next logs it and error tracking records it.
 */
export function handler<U = undefined, B = undefined, Q = undefined, P = undefined>(
  opts: HandlerOptions<U, B, Q, P>,
  action: (ctx: HandlerContext<U, B, Q, P>) => Promise<ServiceResponse | Response>,
) {
  return async (req: NextRequest, route?: RouteContext): Promise<Response> => {
    try {
      const sameOrigin = opts.sameOrigin ?? req.method !== "GET";
      if (sameOrigin && !isSameOrigin(req))
        throw new ForbiddenError("Cross-origin request rejected");
      const user = (opts.guard ? await opts.guard(req) : undefined) as U;
      if (opts.rateLimit) {
        const policy = typeof opts.rateLimit === "function" ? opts.rateLimit() : opts.rateLimit;
        const { name, limit, windowMs } = policy;
        const who =
          !policy.byIp && user && typeof user === "object" && "id" in user
            ? String(user.id)
            : clientKey(req);
        if (!(await rateLimit(`${name}:${who}`, limit, windowMs, { local: policy.local })))
          throw new RateLimitedError(undefined, Math.ceil(windowMs / 1000));
      }
      const params = parse(opts.params, route ? await route.params : {}, "Invalid path");
      const query = parse(
        opts.query,
        Object.fromEntries(req.nextUrl.searchParams.entries()),
        "Invalid query",
      );
      const body = opts.body
        ? parse(
            opts.body,
            await req.json().catch(() => null),
            opts.invalidMessage ?? "Invalid request body",
          )
        : (undefined as B);
      const result = await action({ req, user, body, query, params });
      return result instanceof ServiceResponse ? toNextResponse(result) : result;
    } catch (e) {
      if (e instanceof AppError) return toNextResponse(ServiceResponse.failure(e));
      throw e;
    }
  };
}
