import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { IdentityController } from "./identity.controller";
import type { IdentityProvider } from "./identity.ports";
import { FakeIdentityProvider } from "./infrastructure/fake-identity-provider";
import { SteamOpenIdProvider } from "./infrastructure/steam-openid-provider";
import { NoncesRepository } from "./repositories/nonces.repository";
import { SessionsRepository } from "./repositories/sessions.repository";
import { UsersRepository } from "./repositories/users.repository";
import { AuthService } from "./services/auth.service";
import { UsersService } from "./services/users.service";

export const usersRepository = new UsersRepository(getDb);
export const sessionsRepository = new SessionsRepository(getDb);
export const noncesRepository = new NoncesRepository(getDb);

/**
 * `testSteamId` only matters in AUTH_TEST_MODE (never production): lets E2E tests sign in as
 * a second person, e.g. the other captain of a draft room.
 */
function buildAuthService(testSteamId?: string): AuthService {
  const config = env();
  const provider: IdentityProvider =
    config.AUTH_TEST_MODE && config.NODE_ENV !== "production"
      ? new FakeIdentityProvider(testSteamId)
      : new SteamOpenIdProvider({ nonces: noncesRepository });
  return new AuthService({
    provider,
    users: usersRepository,
    sessions: sessionsRepository,
    appUrl: config.APP_URL,
    adminSteamIds: config.ADMIN_STEAM_IDS,
  });
}

export const authService = lazy(() => buildAuthService());

export const usersService = new UsersService({
  users: usersRepository,
  sessions: sessionsRepository,
});

export const identityController = new IdentityController({
  auth: authService,
  authAs: (testSteamId) => (testSteamId ? buildAuthService(testSteamId) : authService),
  users: usersService,
  appUrl: () => env().APP_URL,
  secureCookies: () => env().NODE_ENV === "production",
  logger,
});
