import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/common/config/env";
import { logger } from "@/common/logging/logger";
import { requestId } from "@/common/http/http";
import {
  getAuthService,
  SESSION_COOKIE,
  sessionCookieOptions,
  STATE_COOKIE,
} from "@/modules/identity/composition";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthService();
  const result = await auth.completeSignIn({
    params: req.nextUrl.searchParams,
    cookieState: req.cookies.get(STATE_COOKIE)?.value,
  });
  const appUrl = env().APP_URL;

  if (!result.ok) {
    logger.warn("steam_sign_in_rejected", {
      requestId: requestId(req),
      reason: result.error.type,
    });
    const res = NextResponse.redirect(new URL(`/?auth_error=${result.error.type}`, appUrl), 303);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/v1/auth/steam" });
    return res;
  }

  logger.info("steam_sign_in_succeeded", {
    requestId: requestId(req),
    userId: result.value.user.id,
  });
  const res = NextResponse.redirect(new URL("/dashboard", appUrl), 303);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/v1/auth/steam" });
  res.cookies.set(
    SESSION_COOKIE,
    result.value.session.token,
    sessionCookieOptions(result.value.session.expiresAt),
  );
  return res;
}
