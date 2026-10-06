import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/common/http/http";
import { PATCH_PAGE_DEFAULT, PATCH_PAGE_MAX } from "@/modules/patches/application/ports";
import { getPatchQueries } from "@/modules/patches/composition";
import { parsePatchVersion } from "@/modules/patches/domain/patch-version";

const QuerySchema = z.object({
  cursor: z
    .string()
    .max(10)
    .refine((v) => parsePatchVersion(v).ok, "invalid cursor")
    .optional(),
  limit: z.coerce.number().int().min(1).max(PATCH_PAGE_MAX).default(PATCH_PAGE_DEFAULT),
});

/** Patch index, newest version first, with cursor pagination. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const query = QuerySchema.safeParse({
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!query.success) return apiError("bad_request", "Invalid query", z.treeifyError(query.error));

  const page = await (await getPatchQueries()).list(query.data);
  const res = NextResponse.json(page);
  res.headers.set("cache-control", "public, s-maxage=300, stale-while-revalidate=600");
  return res;
}
