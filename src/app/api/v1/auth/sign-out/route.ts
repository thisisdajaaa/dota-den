import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { apiError, isSameOrigin } from "@/lib/http";
import { getAuthService, SESSION_COOKIE } from "@/modules/identity/composition";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const auth = await getAuthService();
  await auth.signOut(req.cookies.get(SESSION_COOKIE)?.value);
  // The landing page explains that Steam keeps its own sign-in (see `bye` there).
  const res = NextResponse.redirect(new URL("/?bye=1", env().APP_URL), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
