import { logger } from "@/common/logging/logger";
import { getWeekGoals } from "@/modules/goals/composition";
import {
  describeGoal,
  finalResult,
  goalProgress,
  type WeekData,
} from "@/modules/goals/domain/goals";
import { GoalsCard } from "@/modules/goals/ui/goals-card";
import type { User } from "@/modules/identity/domain/user";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { getMmrJournal } from "@/modules/mmr/composition";
import { addDays, daysBetween, dayKeyFormatter, type DayKey } from "@/modules/mmr/domain/day-key";
import { periodFor } from "@/modules/mmr/domain/periods";
import { getSessionService } from "@/modules/sessions/composition";

async function load(user: User, timeZone: string) {
  const dayKey = dayKeyFormatter(timeZone);
  const today = dayKey(new Date());
  const week = periodFor("week", today, today, null);
  const lastFrom = addDays(week.from, -7);
  const owner = { userId: user.id, accountId32: user.accountId32 };
  const [goals, lastGoals, sessions, entries] = await Promise.all([
    getWeekGoals(user.id, week.from),
    getWeekGoals(user.id, lastFrom),
    getSessionService().then((s) => s.rankedSessions(owner)),
    getMmrJournal().then((j) => j.list(owner)),
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
      mmrEntries: entries.map((e) => e.observedAt),
    };
  };
  return {
    goals,
    lastGoals,
    thisWeek: weekData(week.from, week.to),
    lastWeek: weekData(lastFrom, addDays(week.to, -7)),
    daysLeft: daysBetween(today, week.to).length - 1,
  };
}

/** Up to two goals for the week, measured from the player's own games and MMR log. */
export async function GoalsSection({
  user,
  heroes,
  timeZone,
}: {
  user: User;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  let data;
  try {
    data = await load(user, timeZone);
  } catch (error) {
    logger.warn("weekly_goals_failed", { error });
    return null;
  }
  const name = (id: number) => heroName(heroes.get(id), id);
  const rows = data.goals.map((goal) => {
    const p = goalProgress(goal, data.thisWeek);
    return {
      goal,
      label: describeGoal(goal, name),
      current: p.current,
      met: p.met,
      fraction: p.fraction,
    };
  });
  const lastWeek = data.lastGoals.map((goal) => ({
    label: describeGoal(goal, name),
    met: finalResult(goalProgress(goal, data.lastWeek)),
  }));
  const heroOptions = [...heroes.values()]
    .map((h) => ({ id: h.id, name: h.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <GoalsCard rows={rows} lastWeek={lastWeek} heroes={heroOptions} daysLeft={data.daysLeft} />
  );
}
