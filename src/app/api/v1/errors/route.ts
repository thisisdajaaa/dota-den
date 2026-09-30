import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { recordError } from "@/modules/errors/composition";

const BodySchema = z.object({
  message: z.string().max(2_000),
  digest: z.string().max(64).nullable().optional(),
  path: z.string().max(500).nullable().optional(),
  stack: z.string().max(4_000).nullable().optional(),
});

/** Errors caught by the app's error pages in the browser. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!(await rateLimit(`error-report:${clientKey(req)}`, 20, 60_000))) {
    return apiError("rate_limited", "Too many error reports");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid error report");
  await recordError({ source: "client", kind: "boundary", ...body.data });
  return new NextResponse(null, { status: 204 });
}
