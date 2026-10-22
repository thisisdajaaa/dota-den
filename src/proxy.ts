import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/common/http/request-path";

/**
 * Attach a request ID to every request/response for log correlation, and pass the requested
 * path on to Server Components (for returning there after sign-in).
 */
export function proxy(req: NextRequest): NextResponse {
  const id = req.headers.get("x-request-id") ?? crypto.randomUUID();
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
