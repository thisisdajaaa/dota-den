import "server-only";
import type { NextRequest } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/common/errors/app-error";
import { getRouteUser } from "./composition";
import type { User } from "./domain/user";

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
