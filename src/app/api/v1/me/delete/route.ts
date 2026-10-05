import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { getRouteUser, SESSION_COOKIE } from "@/modules/identity/composition";
import { deleteAllMyData } from "@/modules/privacy/composition";

const Body = z.object({ confirm: z.literal("DELETE") });

/** Delete your account and everything stored about you. Same-origin, typed confirmation. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Type DELETE to confirm.");
  const deleted = await deleteAllMyData({ userId: user.id, accountId32: user.accountId32 });
  const res = NextResponse.json({ deleted });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
