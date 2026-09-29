import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import {
  getAuthService,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/modules/identity/composition";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await getAuthService();
  const resolved = await auth.resolveSession(req.cookies.get(SESSION_COOKIE)?.value, {
    rotate: true,
  });
  if (!resolved) return apiError("unauthorized", "Not signed in");

  const { user, rotated } = resolved;
  const res = NextResponse.json({
    id: user.id,
    steamId64: user.steamId64,
    accountId32: user.accountId32,
    persona: user.persona,
    settings: user.settings,
    isAdmin: user.roles.includes("admin"),
  });
  res.headers.set("cache-control", "private, no-store");
  if (rotated)
    res.cookies.set(SESSION_COOKIE, rotated.token, sessionCookieOptions(rotated.expiresAt));
  return res;
}
