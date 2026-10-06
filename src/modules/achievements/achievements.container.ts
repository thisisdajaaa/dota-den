import "server-only";
import { getActivityCounts } from "@/modules/leaderboards";
import { getMmrJournal } from "@/modules/mmr";
import { getSessionService } from "@/modules/sessions";
import { AchievementsService } from "./achievements.service";

export const achievementsService = new AchievementsService({
  sessions: {
    rankedSessions: async (owner) => (await getSessionService()).rankedSessions(owner),
  },
  mmr: {
    entryTimes: async (owner) =>
      (await (await getMmrJournal()).list(owner)).map((e) => e.observedAt),
  },
  activity: {
    counts: async (userId) =>
      (await getActivityCounts([userId])).get(userId) ?? { drafts: 0, challenges: 0 },
  },
});
