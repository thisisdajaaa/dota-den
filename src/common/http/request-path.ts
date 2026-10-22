/**
 * Request header the proxy sets to the requested path and query, so a Server Component (which
 * isn't given the URL) can send a signed-out visitor back there after sign-in. The proxy always
 * overwrites it, and readers must still validate it (`safeReturnPath`).
 */
export const REQUEST_PATH_HEADER = "x-dd-path";
