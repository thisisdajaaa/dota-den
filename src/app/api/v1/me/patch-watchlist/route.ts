import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/common/http/http";
import { getAuthService, SESSION_COOKIE } from "@/modules/identity/composition";
import { getPatchWatchlistService } from "@/modules/patches/composition";
import { WATCHLIST_MAX_HEROES, WATCHLIST_MAX_ITEMS } from "@/modules/patches/domain/watchlist";

const id = z.number().int().positive().max(100_000);
const BodySchema = z
  .object({
    heroIds: z.array(id).max(WATCHLIST_MAX_HEROES),
    itemIds: z.array(id).max(WATCHLIST_MAX_ITEMS).default([]),
  })
  .strict();

async function currentUserId(req: NextRequest): Promise<string | null> {
  const auth = await getAuthService();
  const session = await auth.resolveSession(req.cookies.get(SESSION_COOKIE)?.value);
  return session?.user.id ?? null;
}

function respond(w: { heroIds: number[]; itemIds: number[]; updatedAt: Date | null }) {
  const res = NextResponse.json({ heroIds: w.heroIds, itemIds: w.itemIds, updatedAt: w.updatedAt });
  res.headers.set("cache-control", "private, no-store");
  return res;
}

/** The signed-in user's patch watchlist. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await currentUserId(req);
  if (!userId) return apiError("unauthorized", "Not signed in");
  return respond(await (await getPatchWatchlistService()).get(userId));
}

/** Replace the signed-in user's patch watchlist. */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const userId = await currentUserId(req);
  if (!userId) return apiError("unauthorized", "Not signed in");

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiError("bad_request", "Body must be JSON");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return apiError("bad_request", "Invalid body", z.treeifyError(body.error));

  const result = await (await getPatchWatchlistService()).replace(userId, body.data);
  if (!result.ok)
    return apiError("bad_request", "Watchlist is too long", { limit: result.error.limit });
  return respond(result.value);
}
