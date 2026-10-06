import "server-only";
import type { DataOwner } from "@/common/privacy/user-data";
import { cookies } from "next/headers";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { getDb } from "@/common/db/mongo";
import { AuthService } from "./application/auth-service";
import type { ProfileVisibility, User } from "./domain/user";
import type { IdentityProvider } from "./application/ports";
import { FakeIdentityProvider } from "./infrastructure/fake-identity-provider";
import { SteamOpenIdProvider } from "./infrastructure/steam-openid-provider";
import {
  MongoNonceStore,
  MongoSessionRepository,
  MongoUserRepository,
  adminUserRows,
} from "./infrastructure/mongo-identity-repositories";
import * as userData from "./infrastructure/user-data";

export const SESSION_COOKIE = "dd_session";
export const STATE_COOKIE = "dd_oid_state";

/**
 * `testSteamId` only matters in AUTH_TEST_MODE (never production): lets E2E tests sign in as
 * a second person, e.g. the other captain of a draft room.
 */
export async function getAuthService(opts: { testSteamId?: string } = {}): Promise<AuthService> {
  const config = env();
  const db = await getDb();
  const provider: IdentityProvider =
    config.AUTH_TEST_MODE && config.NODE_ENV !== "production"
      ? new FakeIdentityProvider(opts.testSteamId)
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

/** Users by id, for views that list other players (e.g. leaderboards). Missing ids are skipped. */
export async function findUsersByIds(ids: readonly string[]): Promise<User[]> {
  return new MongoUserRepository(await getDb()).findByIds(ids);
}

/** The Dota Den users among these Steam accounts. */
export async function findUsersByAccountIds(accountIds: readonly number[]): Promise<User[]> {
  return new MongoUserRepository(await getDb()).findByAccountIds(accountIds);
}

/** Users who chose to be listed publicly (capped: the Everyone leaderboards read this). */
export async function findPublicUserIds(limit = 5_000): Promise<string[]> {
  return new MongoUserRepository(await getDb()).findPublicIds(limit);
}

/** Change who can see a user's profile and activity. "public" lists them on Everyone boards. */
export async function setProfileVisibility(
  userId: string,
  visibility: ProfileVisibility,
): Promise<boolean> {
  return new MongoUserRepository(await getDb()).setProfileVisibility(
    userId,
    visibility,
    new Date(),
  );
}

/** Admin overview: every user with session counts and last activity. */
export async function getAdminUserRows() {
  return adminUserRows(await getDb());
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
