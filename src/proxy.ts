import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/common/http/request-path";

/** Request IDs we accept from the caller (e.g. an upstream proxy); anything else is replaced. */
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Attach a request ID to every request/response for log correlation, and pass the requested
 * path on to Server Components (for returning there after sign-in).
 */
export function proxy(req: NextRequest): NextResponse {
  // A client-chosen ID ends up in our logs: only a plain token is kept, never arbitrary text.
  const given = req.headers.get("x-request-id");
  const id = given && REQUEST_ID.test(given) ? given : crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-request-id", id);
  const search = new URLSearchParams(req.nextUrl.search);
  search.delete("_rsc");
  const query = search.toString();
  headers.set(REQUEST_PATH_HEADER, `${req.nextUrl.pathname}${query ? `?${query}` : ""}`);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", id);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
