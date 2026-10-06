import type { DataOwner } from "@/common/privacy/user-data";
import { dayKeyFormatter } from "@/common/time/day-key";
import { achievements, type Achievement } from "./domain/achievements";
import type { ActivitySource, MmrLogSource, RankedSessionsSource } from "./achievements.ports";

/** Achievements, computed on demand from the player's own data (nothing is stored). */
export class AchievementsService {
  constructor(
    private readonly deps: {
      sessions: RankedSessionsSource;
      mmr: MmrLogSource;
      activity: ActivitySource;
    },
  ) {}

  async forPlayer(owner: DataOwner, timeZone: string): Promise<Achievement[]> {
    const [sessions, entries, counts] = await Promise.all([
      this.deps.sessions.rankedSessions(owner),
      this.deps.mmr.entryTimes(owner),
      this.deps.activity.counts(owner.userId),
    ]);
    const day = dayKeyFormatter(timeZone);
    return achievements({
      sessions,
      mmrDays: new Set(entries.map(day)).size,
      drafts: counts.drafts,
      challenges: counts.challenges,
    });
  }
}
