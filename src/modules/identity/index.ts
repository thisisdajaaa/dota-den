/** Public API of the identity feature (ADR 0009). */
export {
  getCurrentUser,
  getRouteUser,
  optionalUser,
  requireAdmin,
  requireUser,
  SESSION_COOKIE,
  sessionCookieOptions,
  STATE_COOKIE,
} from "./identity.guards";
export { authService, identityController, usersService } from "./identity.container";
export type { User, ProfileVisibility } from "./domain/user";
export type { AdminUserRow } from "./identity.model";
