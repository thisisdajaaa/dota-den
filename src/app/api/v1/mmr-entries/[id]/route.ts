import { NextResponse, type NextRequest } from "next/server";
import { apiError, isSameOrigin } from "@/lib/http";
import { getRouteUser } from "@/modules/identity/composition";
import { MmrEntryInputSchema, toMmrEntryDto } from "@/modules/mmr/application/contracts";
import { getMmrJournal } from "@/modules/mmr/composition";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  const { id } = await params;

  const parsed = MmrEntryInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Check the highlighted fields",
      parsed.error.flatten().fieldErrors,
    );
  }
  const res = await (
    await getMmrJournal()
  ).update({ userId: user.id, accountId32: user.accountId32 }, id, parsed.data);
  // Someone else's entry is indistinguishable from a missing one.
  return res.ok
    ? NextResponse.json(toMmrEntryDto(res.value))
    : apiError("not_found", "Entry not found");
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  const { id } = await params;
  const res = await (
    await getMmrJournal()
  ).delete({ userId: user.id, accountId32: user.accountId32 }, id);
  return res.ok
    ? new NextResponse(null, { status: 204 })
    : apiError("not_found", "Entry not found");
}
