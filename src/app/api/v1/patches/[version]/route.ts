import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/common/http/http";
import { getPatchQueries } from "@/modules/patches/composition";
import { diffSummary } from "@/modules/patches/domain/patch";

/** Patch detail with the official source link, parse status and fetch time. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/v1/patches/[version]">,
): Promise<NextResponse> {
  const { version } = await ctx.params;
  const patch = await (await getPatchQueries()).getByVersion(version);
  if (!patch) return apiError("not_found", "Unknown patch version");

  const res = NextResponse.json({ ...patch, summary: diffSummary(patch) });
  res.headers.set("cache-control", "public, s-maxage=300, stale-while-revalidate=600");
  return res;
}
