/** Public API of the identity feature (ADR 0009). */
export { requireAdmin, requireUser, optionalUser } from "./identity.guards";
export { getCurrentUser, getRouteUser, SESSION_COOKIE } from "./composition";
export type { User } from "./domain/user";
