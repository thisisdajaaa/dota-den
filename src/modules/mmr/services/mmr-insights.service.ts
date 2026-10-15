import { addDays, dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import { buildCalendar, type QueueScope } from "../domain/calendar";
import { climbByHero } from "../domain/hero-climb";
import { buildJourney, journeyStart, type Journey, type JourneyRange } from "../domain/journey";
import type { MedalDoc } from "../mmr.model";
import { loadWindow } from "../domain/load-window";
import { logPrompt, type LogPrompt } from "../domain/log-prompt";
import { periodFor, type CalendarView } from "../domain/periods";
import { weeklyRecap, type RecapGame, type WeeklyRecap } from "../domain/weekly-recap";
import type { JournalOwner } from "../dtos/responses/mmr.dto";
import type { MmrJournalService } from "./mmr-journal.service";

/** Without any entry, only recent games prompt a first one (no nagging about old history). */
const FIRST_ENTRY_WINDOW_MS = 3 * 86_400_000;

/** Ranked results over a time range (from the matches feature). */
export interface RankedGamesSource {
  rankedResults(
    accountId32: number,
    range: { from: Date; to: Date },
  ): Promise<Array<RecapGame & { matchId: string }>>;
}

/** What the overview shows from the MMR journal: the weekly recap and the "log MMR" prompt. */
export class MmrInsightsService {
  constructor(
    private readonly deps: {
      journal: MmrJournalService;
      ranked: RankedGamesSource;
      medals: { history(accountId32: number): Promise<MedalDoc[]> };
      now?: () => Date;
    },
  ) {}

  /**
   * This week against last week, in the player's time zone. `weekOf` picks another week (any
   * day in it), e.g. a finished week for the weekly email; the week before it is "last week".
   */
  async weeklyRecap(
    owner: JournalOwner,
    timeZone: string,
    opts: { weekOf?: DayKey } = {},
  ): Promise<WeeklyRecap> {
    const now = this.deps.now?.() ?? new Date();
    const dayKey = dayKeyFormatter(timeZone);
    const today = dayKey(now);
    const week = periodFor("week", opts.weekOf ?? today, today, null);
    const entries = await this.deps.journal.list(owner);
    // Games from last week's start (or the entry before it) to the entry after this week.
    const loaded = loadWindow(entries, { from: addDays(week.from, -7), to: week.to }, now);
    const games = await this.deps.ranked.rankedResults(owner.accountId32, loaded);
    return weeklyRecap({
      games,
      observations: entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
      week: { from: week.from, to: week.to },
      dayKey,
      loaded,
    });
  }

  /** Asks for an MMR entry after ranked games; null when there's nothing to ask. */
  async logPrompt(owner: JournalOwner): Promise<LogPrompt | null> {
    const now = this.deps.now?.() ?? new Date();
    const entries = await this.deps.journal.list(owner);
    const latest = entries.at(-1) ?? null;
    const games = await this.deps.ranked.rankedResults(owner.accountId32, {
      from: latest?.observedAt ?? new Date(now.getTime() - FIRST_ENTRY_WINDOW_MS),
      to: now,
    });
    return logPrompt(latest && { mmr: latest.mmr, observedAt: latest.observedAt }, games);
  }

  /**
   * The MMR journal page: entries, medal history, and the calendar and hero climbs for one
   * period. Games are loaded out to the entries either side of the period, so a change between
   * two entries is only called exact when every game between them is known.
   */
  async calendarView(
    owner: JournalOwner,
    opts: { view: CalendarView; anchor: DayKey; scope: QueueScope; timeZone: string; now: Date },
  ) {
    const { view, anchor, scope, now } = opts;
    const dayKey = dayKeyFormatter(opts.timeZone);
    const today = dayKey(now);
    const [entries, medals] = await Promise.all([
      this.deps.journal.list(owner),
      this.deps.medals.history(owner.accountId32).catch(() => []),
    ]);
    // All time starts at the earliest entry or ranked game we know about.
    const everything =
      view === "all"
        ? await this.deps.ranked.rankedResults(owner.accountId32, { from: new Date(0), to: now })
        : [];
    const earliestKeys = [
      ...entries.slice(0, 1).map((e) => dayKey(e.observedAt)),
      ...everything.map((m) => dayKey(m.startedAt)),
    ].sort();
    const period = periodFor(view, anchor, today, earliestKeys[0] ?? null);
    const loaded =
      view === "all" ? { from: new Date(0), to: now } : loadWindow(entries, period, now);
    const matches =
      view === "all" ? everything : await this.deps.ranked.rankedResults(owner.accountId32, loaded);
    const observations = entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr }));
    const calendar = buildCalendar({
      observations,
      matches,
      period: { from: period.from, to: period.to },
      dayKey,
      scope,
      loaded,
    });
    const climbs = climbByHero({
      observations,
      matches,
      scope,
      loaded,
      inPeriod: (d) => {
        const k = dayKey(d);
        return k >= period.from && k <= period.to;
      },
    });
    return { entries, medals, period, calendar, climbs, matches };
  }

  /**
   * The rank journey over a range ending now: medal changes, logged MMR, and ranked games for
   * the heroes of each stretch. Medals and MMR stay separate; nothing is estimated.
   */
  async journey(owner: JournalOwner, range: JourneyRange): Promise<Journey> {
    const now = this.deps.now?.() ?? new Date();
    const [entries, medals] = await Promise.all([
      this.deps.journal.list(owner),
      this.deps.medals.history(owner.accountId32).catch(() => []),
    ]);
    const earliest = [entries[0]?.observedAt, medals[0]?.observedAt]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const from = journeyStart(range, now, earliest ?? null);
    const matches = await this.deps.ranked.rankedResults(owner.accountId32, { from, to: now });
    return buildJourney({
      range,
      now,
      medals,
      observations: entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
      matches,
    });
  }
}
