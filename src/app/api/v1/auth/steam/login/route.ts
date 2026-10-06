import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/common/config/env";
import { getAuthService, STATE_COOKIE } from "@/modules/identity/composition";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Test mode only: `?as=<SteamID64>` picks the fake identity (ignored by real Steam sign-in).
  const as = req.nextUrl.searchParams.get("as");
  const auth = await getAuthService({ testSteamId: as && /^\d{17}$/.test(as) ? as : undefined });
  const { redirectUrl, state } = auth.beginSignIn();
  const res = NextResponse.redirect(redirectUrl, 302);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/api/v1/auth/steam",
    maxAge: 10 * 60,
  });
  return res;
}
