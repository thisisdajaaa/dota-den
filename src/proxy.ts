import { NextResponse, type NextRequest } from "next/server";

/** Attach a request ID to every request/response for log correlation. */
export function proxy(req: NextRequest): NextResponse {
  const id = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const headers = new Headers(req.headers);
  headers.set("x-request-id", id);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", id);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
