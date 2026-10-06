import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "@/common/config/env";
import { ForbiddenError, UnauthorizedError } from "@/common/errors/app-error";
import { logger } from "@/common/logging/logger";
import type { User } from "./domain/user";
import { authService } from "./identity.container";

export const SESSION_COOKIE = "dd_session";
export const STATE_COOKIE = "dd_oid_state";

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().NODE_ENV === "production",
    path: "/",
    expires,
  };
}

/**
 * For Server Components: read-only session lookup (cookies can't be set during render).
 * With `tolerateErrors`, a database failure yields null instead of throwing; used by
 * chrome like the header so an outage doesn't take down public pages.
 */
export async function getCurrentUser(
  opts: { tolerateErrors?: boolean } = {},
): Promise<User | null> {
  // Read cookies outside any try/catch so Next can detect dynamic rendering.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return (await authService.resolveSession(token))?.user ?? null;
  } catch (e) {
    if (!opts.tolerateErrors) throw e;
    logger.error("session_lookup_failed", { error: e });
    return null;
  }
}

/** For route handlers: the signed-in user for this request, or null. */
export async function getRouteUser(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<User | null> {
  return (await authService.resolveSession(req.cookies.get(SESSION_COOKIE)?.value))?.user ?? null;
}

/** Controller guard: the signed-in user, or 401. */
export async function requireUser(req: NextRequest): Promise<User> {
  const user = await getRouteUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Controller guard: a signed-in admin, or 401/403. */
export async function requireAdmin(req: NextRequest): Promise<User> {
  const user = await requireUser(req);
  if (!user.roles.includes("admin")) throw new ForbiddenError("Admins only");
  return user;
}

/** Controller guard for public endpoints that behave differently when signed in. */
export async function optionalUser(req: NextRequest): Promise<User | null> {
  return getRouteUser(req);
}
