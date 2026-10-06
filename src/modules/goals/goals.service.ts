import type { DataOwner } from "@/common/privacy/user-data";
import { addDays, daysBetween, dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import { periodFor } from "@/modules/mmr/domain/periods";
import { finalResult, goalProgress, type Goal, type WeekData } from "./domain/goals";
import type { SavedGoalsDto, WeeklyGoalsViewDto } from "./dtos/responses/weekly-goals.dto";
import type { GoalsRepositoryPort, MmrLogSource, RankedSessionsSource } from "./goals.ports";

export interface GoalsServiceDeps {
  repository: GoalsRepositoryPort;
  sessions: RankedSessionsSource;
  mmr: MmrLogSource;
  now?: () => Date;
}

/** Weekly goals: set this week's (up to two) and see progress from your own games. */
export class GoalsService {
  constructor(private readonly deps: GoalsServiceDeps) {}

  private currentWeek(timeZone: string) {
    const dayKey = dayKeyFormatter(timeZone);
    const today = dayKey(this.deps.now?.() ?? new Date());
    return { dayKey, today, week: periodFor("week", today, today, null) };
  }

  /** Saves this week's goals (in the player's time zone); past weeks can't be changed. */
  async saveThisWeek(owner: DataOwner, goals: Goal[], timeZone: string): Promise<SavedGoalsDto> {
    const { week } = this.currentWeek(timeZone);
    await this.deps.repository.saveGoals(owner.userId, week.from, goals);
    return { week: week.from, goals };
  }

  async weekView(owner: DataOwner, timeZone: string): Promise<WeeklyGoalsViewDto> {
    const { dayKey, today, week } = this.currentWeek(timeZone);
    const lastFrom = addDays(week.from, -7);
    const [goals, lastGoals, sessions, mmrEntries] = await Promise.all([
      this.deps.repository.findGoals(owner.userId, week.from),
      this.deps.repository.findGoals(owner.userId, lastFrom),
      this.deps.sessions.rankedSessions(owner),
      this.deps.mmr.entryTimes(owner),
    ]);

    const weekData = (from: DayKey, to: DayKey): WeekData => {
      const inWeek = sessions.filter((s) => {
        const k = dayKey(s.startedAt);
        return k >= from && k <= to;
      });
      return {
        sessions: inWeek.map((s) => ({
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          rankedGames: s.matches.length,
        })),
        games: inWeek.flatMap((s) =>
          s.matches.map((m) => ({ startedAt: m.startedAt, result: m.result, heroId: m.heroId })),
        ),
        mmrEntries,
      };
    };
    const thisWeek = weekData(week.from, week.to);
    const lastWeek = weekData(lastFrom, addDays(week.to, -7));
    return {
      week: week.from,
      daysLeft: daysBetween(today, week.to).length - 1,
      thisWeek: goals.map((goal) => {
        const { current, met, fraction } = goalProgress(goal, thisWeek);
        return { goal, current, met, fraction };
      }),
      lastWeek: lastGoals.map((goal) => ({
        goal,
        met: finalResult(goalProgress(goal, lastWeek)),
      })),
    };
  }

  async exportMyData(owner: DataOwner) {
    return { weeklyGoals: await this.deps.repository.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { weeklyGoals: await this.deps.repository.deleteForOwner(owner) };
  }
}
