import { logger } from "@/common/logging/logger";
import type { User } from "@/modules/identity/domain/user";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { getMatchQueries } from "@/modules/matches/composition";
import { getMmrJournal } from "@/modules/mmr/composition";
import { addDays, dayKeyFormatter } from "@/modules/mmr/domain/day-key";
import { periodFor } from "@/modules/mmr/domain/periods";
import { weeklyRecap } from "@/modules/mmr/domain/weekly-recap";
import { WeeklyRecapCard } from "@/modules/mmr/ui/weekly-recap-card";

const TZ_PAD_MS = 15 * 3_600_000; // wider than any UTC offset

async function loadRecap(user: User, timeZone: string) {
  try {
    const dayKey = dayKeyFormatter(timeZone);
    const today = dayKey(new Date());
    const week = periodFor("week", today, today, null);
    const entries = await (
      await getMmrJournal()
    ).list({ userId: user.id, accountId32: user.accountId32 });
    // Games from last week's start (or the entry before it) to the entry after this week.
    const weekFrom = new Date(Date.parse(`${addDays(week.from, -7)}T00:00:00Z`) - TZ_PAD_MS);
    const weekTo = new Date(Date.parse(`${week.to}T23:59:59Z`) + TZ_PAD_MS);
    const before = entries.findLast((e) => e.observedAt < weekFrom);
    const after = entries.find((e) => e.observedAt > weekTo);
    const loaded = {
      from: before?.observedAt ?? weekFrom,
      to: after?.observedAt ?? weekTo,
    };
    const games = await (await getMatchQueries()).rankedResults(user.accountId32, loaded);
    return weeklyRecap({
      games,
      observations: entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
      week: { from: week.from, to: week.to },
      dayKey,
      loaded,
    });
  } catch (error) {
    logger.warn("weekly_recap_failed", { error });
    return null;
  }
}

const shortDay = (k: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${k}T12:00:00Z`),
  );

/** This week against last week. Renders nothing without ranked games in either. */
export async function WeeklyRecapSection({
  user,
  heroes,
  timeZone,
}: {
  user: User;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
}) {
  const recap = await loadRecap(user, timeZone);
  if (!recap || (recap.thisWeek.games === 0 && recap.lastWeek.games === 0)) return null;
  return (
    <WeeklyRecapCard
      recap={recap}
      heroes={heroes}
      rangeLabel={`${shortDay(recap.from)} – ${shortDay(recap.to)}`}
    />
  );
}
