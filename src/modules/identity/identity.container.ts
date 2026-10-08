import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { IdentityController } from "./identity.controller";
import type { IdentityProvider, PersonaLookup } from "./identity.ports";
import { FakeIdentityProvider } from "./infrastructure/fake-identity-provider";
import { SteamOpenIdProvider } from "./infrastructure/steam-openid-provider";
import { NoncesRepository } from "./repositories/nonces.repository";
import { AuthSessionsRepository } from "./repositories/auth-sessions.repository";
import { UsersRepository } from "./repositories/users.repository";
import { AuthService } from "./services/auth.service";
import { UsersService } from "./services/users.service";

export const usersRepository = new UsersRepository(getDb);
export const sessionsRepository = new AuthSessionsRepository(getDb);
export const noncesRepository = new NoncesRepository(getDb);

// Imported on use: matches depends on identity (requireUser), so a static import is a cycle.
const lookupPersona: PersonaLookup = async (accountId32) => {
  const { matchesService } = await import("@/modules/matches");
  const profile = await matchesService.playerProfile(accountId32);
  return profile?.personaName ? { name: profile.personaName, avatarUrl: profile.avatarUrl } : null;
};

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
    persona: lookupPersona,
  });
}

export const authService = lazy(() => buildAuthService());

export const usersService = new UsersService({
  users: usersRepository,
  sessions: sessionsRepository,
});

// Lazy: identity.controller imports identity.guards, which imports this file, so the
// IdentityController class may not be initialised yet when this module is evaluated.
export const identityController = lazy(
  () =>
    new IdentityController({
      auth: authService,
      authAs: (testSteamId) => (testSteamId ? buildAuthService(testSteamId) : authService),
      users: usersService,
      appUrl: () => env().APP_URL,
      secureCookies: () => env().NODE_ENV === "production",
      logger,
    }),
);
