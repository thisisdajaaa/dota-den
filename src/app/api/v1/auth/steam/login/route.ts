import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getAuthService, STATE_COOKIE } from "@/modules/identity/composition";

export async function GET(): Promise<NextResponse> {
  const auth = await getAuthService();
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
