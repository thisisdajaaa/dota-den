import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { decodeSnapshot } from "@/modules/drafts/application/snapshot";
import { getAiOpponent } from "@/modules/drafts/composition";

const Position = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
/** Positions set by hand: hero id -> position, per side. */
const Roles = z.record(z.string().regex(/^\d{1,4}$/), Position).optional();
const BodySchema = z.object({
  snapshot: z.string().min(1).max(2_000),
  roles: z.object({ radiant: Roles, dire: Roles }).optional(),
});

const toMap = (r: Record<string, 1 | 2 | 3 | 4 | 5> | undefined) =>
  r ? new Map(Object.entries(r).map(([id, p]) => [Number(id), p] as const)) : undefined;

/** Which side the draft favours so far: an estimate from public and tournament data. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  if (!rateLimit(`draft-outlook:${clientKey(req)}`, 60, 60_000)) {
    return apiError("rate_limited", "Too many requests in the last minute.");
  }
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid request");
  const snapshot = decodeSnapshot(body.data.snapshot);
  if (!snapshot.ok) return apiError("bad_request", "Invalid draft");

  const { roles } = body.data;
  const res = await (
    await getAiOpponent()
  ).outlook(snapshot.value, {
    radiant: toMap(roles?.radiant),
    dire: toMap(roles?.dire),
  });
  if (!res.ok) return apiError("bad_request", "Invalid draft");
  return NextResponse.json(res.value);
}
