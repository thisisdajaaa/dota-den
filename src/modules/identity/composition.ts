import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getDb } from "@/lib/db/mongo";
import { AuthService } from "./application/auth-service";
import type { User } from "./domain/user";
import type { IdentityProvider } from "./application/ports";
import { FakeIdentityProvider } from "./infrastructure/fake-identity-provider";
import { SteamOpenIdProvider } from "./infrastructure/steam-openid-provider";
import {
  MongoNonceStore,
  MongoSessionRepository,
  MongoUserRepository,
} from "./infrastructure/mongo-identity-repositories";

export const SESSION_COOKIE = "dd_session";
export const STATE_COOKIE = "dd_oid_state";

export async function getAuthService(): Promise<AuthService> {
  const config = env();
  const db = await getDb();
  const provider: IdentityProvider =
    config.AUTH_TEST_MODE && config.NODE_ENV !== "production"
      ? new FakeIdentityProvider()
      : new SteamOpenIdProvider({ nonces: new MongoNonceStore(db) });
  return new AuthService({
    provider,
    users: new MongoUserRepository(db),
    sessions: new MongoSessionRepository(db),
    appUrl: config.APP_URL,
    adminSteamIds: config.ADMIN_STEAM_IDS,
  });
}

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
    const auth = await getAuthService();
    const resolved = await auth.resolveSession(token);
    return resolved?.user ?? null;
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
  const auth = await getAuthService();
  const resolved = await auth.resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
  return resolved?.user ?? null;
}
