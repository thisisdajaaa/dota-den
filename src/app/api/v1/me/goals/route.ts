import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { saveWeekGoals } from "@/modules/goals/composition";
import { MAX_CUSTOM_LENGTH, MAX_GOALS } from "@/modules/goals/domain/goals";
import { getRouteUser } from "@/modules/identity/composition";
import { getViewerTimeZone } from "@/modules/mmr/composition";
import { dayKeyFormatter } from "@/modules/mmr/domain/day-key";
import { periodFor } from "@/modules/mmr/domain/periods";

const GoalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("winRate"), target: z.number().int().min(40).max(80) }),
  z.object({ type: z.literal("maxPerSession"), target: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal("logAfterSessions") }),
  z.object({
    type: z.literal("heroGames"),
    heroId: z.number().int().min(1).max(1000),
    target: z.number().int().min(1).max(30),
  }),
  z.object({
    type: z.literal("custom"),
    text: z.string().trim().min(1).max(MAX_CUSTOM_LENGTH),
    done: z.boolean(),
  }),
]);

const Body = z.object({ goals: z.array(GoalSchema).max(MAX_GOALS) });

/** Set this week's goals (this week in your time zone; past weeks can't be changed). */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(req)) return apiError("forbidden", "Cross-origin request rejected");
  const user = await getRouteUser(req);
  if (!user) return apiError("unauthorized", "Not signed in");
  if (!(await rateLimit(`goals:${user.id}`, 30, 60_000))) {
    return apiError("rate_limited", "Too many saves. Try again in a minute.");
  }
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", "Invalid goals");
  const { timeZone } = await getViewerTimeZone();
  const today = dayKeyFormatter(timeZone)(new Date());
  const week = periodFor("week", today, today, null).from;
  await saveWeekGoals(user.id, week, body.data.goals);
  return NextResponse.json({ week, goals: body.data.goals });
}
