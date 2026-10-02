import "server-only";
import { getActivityCounts } from "@/modules/leaderboards/composition";
import { getMmrJournal, getViewerTimeZone } from "@/modules/mmr/composition";
import { dayKeyFormatter } from "@/modules/mmr/domain/day-key";
import { getSessionService } from "@/modules/sessions/composition";
import { achievements, type Achievement } from "./domain/achievements";

/** The player's achievements, computed now from their own data. */
export async function getAchievements(user: {
  id: string;
  accountId32: number;
}): Promise<Achievement[]> {
  const owner = { userId: user.id, accountId32: user.accountId32 };
  const [sessions, entries, activity, tz] = await Promise.all([
    getSessionService().then((s) => s.rankedSessions(owner)),
    getMmrJournal().then((j) => j.list(owner)),
    getActivityCounts([user.id]),
    getViewerTimeZone(),
  ]);
  const day = dayKeyFormatter(tz.timeZone);
  const counts = activity.get(user.id) ?? { drafts: 0, challenges: 0 };
  return achievements({
    sessions,
    mmrDays: new Set(entries.map((e) => day(e.observedAt))).size,
    drafts: counts.drafts,
    challenges: counts.challenges,
  });
}
