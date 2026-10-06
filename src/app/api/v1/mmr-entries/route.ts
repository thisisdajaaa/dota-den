import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/common/http/http";
import { getRouteUser } from "@/modules/identity/composition";
import { MmrEntryInputSchema, toMmrEntryDto } from "@/modules/mmr/application/contracts";
import { getMmrJournal } from "@/modules/mmr/composition";

/** Create an actual MMR observation for the signed-in user's account. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");

  const body: unknown = await req.json().catch(() => null);
  const parsed = MmrEntryInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Check the highlighted fields",
      parsed.error.flatten().fieldErrors,
    );
  }
  const journal = await getMmrJournal();
  const entry = await journal.create(
    { userId: user.id, accountId32: user.accountId32 },
    parsed.data,
  );
  return NextResponse.json(toMmrEntryDto(entry), { status: 201 });
}
