import "server-only";
import { activityRepository } from "@/modules/leaderboards";
import { getMmrJournal } from "@/modules/mmr";
import { sessionService } from "@/modules/sessions";
import { AchievementsService } from "./achievements.service";

export const achievementsService = new AchievementsService({
  sessions: {
    rankedSessions: async (owner) => sessionService.rankedSessions(owner),
  },
  mmr: {
    entryTimes: async (owner) =>
      (await (await getMmrJournal()).list(owner)).map((e) => e.observedAt),
  },
  activity: {
    counts: async (userId) =>
      (await activityRepository.countsByUser([userId])).get(userId) ?? { drafts: 0, challenges: 0 },
  },
});
