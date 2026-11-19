import { AppError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import { addDays } from "@/common/time/day-key";
import type { ReadLocale } from "../domain/period-read";
import {
  checkCoachNote,
  COACH_TIME_ZONE,
  coachNoteId,
  coachWeekRange,
  isFinishedCoachWeek,
  lastCoachWeek,
  SMALL_WEEK_GAMES,
  WEEKLY_COACH_VERSION,
  weeklyFacts,
  type CoachNote,
} from "../domain/weekly-coach";
import type { BattleReportView } from "../dtos/responses/battle-report.dto";
import type { CoachNotesPort, StoredCoachNote, WeeklyCoachWriter } from "../report.ports";
import { CoachNoteAnswerSchema } from "../schemas/weekly-coach.schema";

/** Model calls per note: the first answer, and one retry when it fails the checks. */
const MAX_ATTEMPTS = 2;

/** One player's note job (the payload the schedule queues). */
export interface CoachNoteJob {
  userId: string;
  week: string;
}

export type CoachNoteOutcome =
  | "written"
  | "already_written"
  | "no_games"
  | "not_plus"
  | "turned_off"
  | "no_user"
  | "budget_spent"
  | "failed"
  | "off"
  | "invalid";

export type WeeklyCoachView =
  | { status: "off" }
  | { status: "not_plus" | "available"; week: string }
  | { status: "ready"; note: StoredCoachNote };

/** What the push says (the caller translates it into the player's language). */
export interface CoachNoteNews {
  week: string;
  headline: string;
  fix: string;
}

/**
 * The Monday AI weekly coach (Plus). Every Monday morning (Manila time) a schedule queues one
 * job per Plus player; each job reads the player's last week from the battle report, asks the
 * coach's model for a short note in the player's language, checks every number in it against
 * the week's facts (the coach checker rule), stores it once and tells the player with a push.
 * A week without games gets nothing. The player's `weekly_coach` notification setting is the
 * switch: off means no note is written for them automatically (and no AI cost); they can still
 * write it from the report page.
 */
export class WeeklyCoachService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      writer: WeeklyCoachWriter | null;
      notes: CoachNotesPort;
      isPlus: (userId: string) => Promise<boolean>;
      plusUserIds: () => Promise<string[]>;
      /** The player's `weekly_coach` setting (on by default). */
      wants: (userId: string) => Promise<boolean>;
      user: (userId: string) => Promise<{ accountId32: number; locale: ReadLocale } | null>;
      /** The battle report of a range (null when no games source can be read). */
      report: (
        owner: DataOwner,
        range: ReturnType<typeof coachWeekRange>,
        timeZone: string,
      ) => Promise<BattleReportView | null>;
      /** Queues one player's note (deduplicated per player and week). */
      enqueue: (job: CoachNoteJob) => Promise<void>;
      /** Push once per week; returns how many devices got it. */
      notify: (userId: string, news: CoachNoteNews) => Promise<number>;
      /** The global daily model-call budget (shared with the coach and the draft AI). */
      budget: { take(): Promise<boolean> };
      heroName: (heroId: number) => Promise<string>;
      /** Counts a use (admin usage numbers); never fails. */
      used?: (userId: string) => Promise<void>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.writer !== null;
  }

  /** The week a note is about today: the last full week in Manila time. */
  currentWeek(): string {
    return lastCoachWeek(this.now());
  }

  /** The schedule's tick (Monday morning): one job per Plus player who wants the note. */
  async runSchedule(): Promise<{
    week: string;
    players: number;
    queued: number;
    failed?: number;
    off?: true;
  }> {
    const week = this.currentWeek();
    if (!this.enabled) return { week, players: 0, queued: 0, off: true };
    const ids = await this.deps.plusUserIds();
    let queued = 0;
    let failed = 0;
    for (const userId of ids) {
      if (!(await this.deps.wants(userId).catch(() => false))) continue;
      // One player's failed publish must not stop the others' notes.
      try {
        await this.deps.enqueue({ userId, week });
        queued++;
      } catch (error) {
        failed++;
        this.deps.logger.warn("weekly_coach_enqueue_failed", { week, error });
      }
    }
    this.deps.logger.info("weekly_coach_scheduled", { week, players: ids.length, queued, failed });
    return { week, players: ids.length, queued, ...(failed ? { failed } : {}) };
  }

  /**
   * One player's note (the job). Throws only when it's worth a retry (OpenDota or the model
   * down), so the queue tries again; everything else is an outcome.
   */
  async runOne(payload: Record<string, unknown>): Promise<CoachNoteOutcome> {
    const job = parseJob(payload, this.now());
    if (!job) return "invalid";
    if (!this.enabled) return "off";
    // Checked when the job runs: Plus can lapse, or the setting change, after it's queued.
    if (!(await this.deps.isPlus(job.userId))) return "not_plus";
    if (!(await this.deps.wants(job.userId))) return "turned_off";
    const user = await this.deps.user(job.userId);
    if (!user) return "no_user";
    let outcome: CoachNoteOutcome;
    let stored: StoredCoachNote;
    try {
      const result = await this.write(
        { id: job.userId, accountId32: user.accountId32 },
        job.week,
        user.locale,
        {
          checkedPlus: true,
        },
      );
      if (result.status === "no_games") return this.done(job, "no_games");
      stored = result.note;
      outcome = result.status === "cached" ? "already_written" : "written";
    } catch (error) {
      const reason = error instanceof AppError ? reasonOf(error) : null;
      if (reason === "resting") return this.done(job, "budget_spent");
      // Two answers the checker rejected: more tries would cost more for the same result.
      if (reason === "failed") return this.done(job, "failed");
      throw error;
    }
    await this.deps.notify(job.userId, {
      week: job.week,
      headline: stored.note.headline,
      fix: stored.note.fix.title,
    });
    return this.done(job, outcome);
  }

  private done(job: CoachNoteJob, outcome: CoachNoteOutcome): CoachNoteOutcome {
    this.deps.logger.info("weekly_coach_note", { week: job.week, outcome });
    return outcome;
  }

  /** The report page's card for a week (the last full week unless a past one is asked for). */
  async view(user: { id: string }, week?: string | null): Promise<WeeklyCoachView> {
    if (!this.enabled) return { status: "off" };
    const w = week && isFinishedCoachWeek(week, this.now()) ? week : this.currentWeek();
    const stored = await this.deps.notes.get(coachNoteId(user.id, w)).catch(() => null);
    if (stored) return { status: "ready", note: stored };
    return (await this.deps.isPlus(user.id).catch(() => false))
      ? { status: "available", week: w }
      : { status: "not_plus", week: w };
  }

  /**
   * Writes (or re-opens) a player's note for a finished week. Once stored, it's the note for
   * that week: asking again (the job, a retry, the page) returns it without a model call.
   */
  async write(
    user: { id: string; accountId32: number },
    week: string,
    locale: ReadLocale,
    opts: { checkedPlus?: boolean } = {},
  ): Promise<{ status: "written" | "cached"; note: StoredCoachNote } | { status: "no_games" }> {
    const writer = this.deps.writer;
    if (!writer)
      throw new AppError("upstream_unavailable", "The weekly coach isn't set up on this server.", {
        reason: "not_configured",
      });
    if (!isFinishedCoachWeek(week, this.now()))
      throw new AppError("bad_request", "That week isn't over yet.", { reason: "week" });
    const id = coachNoteId(user.id, week);
    const stored = await this.deps.notes.get(id);
    if (stored) return { status: "cached", note: stored };
    if (!opts.checkedPlus && !(await this.deps.isPlus(user.id)))
      throw new AppError("forbidden", "The weekly coach is a Plus feature.", { reason: "plus" });

    const view = await this.deps.report(
      { userId: user.id, accountId32: user.accountId32 },
      coachWeekRange(week),
      COACH_TIME_ZONE,
    );
    if (!view)
      throw new AppError("upstream_unavailable", "Your games can't be read right now.", {
        reason: "games_unavailable",
      });
    const facts = await this.facts(view);
    if (!facts) return { status: "no_games" };

    const note = await this.ask(writer, week, facts.facts, facts.games, locale);
    const kept = await this.deps.notes.saveOnce({
      id,
      userId: user.id,
      week,
      locale,
      model: writer.model,
      version: WEEKLY_COACH_VERSION,
      games: facts.games,
      facts: facts.facts,
      note,
      createdAt: this.now(),
    });
    await this.deps.used?.(user.id);
    this.deps.logger.info("weekly_coach_written", { week, games: facts.games, locale });
    return { status: "written", note: kept };
  }

  private async facts(view: BattleReportView) {
    const names = new Map<number, string>();
    await Promise.all(
      view.report.heroes.map(async (h) => names.set(h.heroId, await this.deps.heroName(h.heroId))),
    );
    return weeklyFacts(
      {
        report: view.report,
        current: view.current,
        previous: view.previous.totals,
        mmrExact: view.mmrExact,
      },
      (id) => names.get(id) ?? `Hero #${id}`,
    );
  }

  /** The model's note, checked; one retry with the problems found. */
  private async ask(
    writer: WeeklyCoachWriter,
    week: string,
    facts: StoredCoachNote["facts"],
    games: number,
    locale: ReadLocale,
  ): Promise<CoachNote> {
    let problems: string[] = [];
    let modelDown = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (!(await this.deps.budget.take()))
        throw new AppError("upstream_unavailable", "The coach is resting. Try again later.", {
          reason: "resting",
        });
      const reply = await writer.write(
        { week, facts, smallWeek: games < SMALL_WEEK_GAMES },
        { locale, problems },
      );
      if (!reply.ok) {
        this.deps.logger.warn("weekly_coach_model_unavailable", { cause: reply.error.cause });
        if (reply.error.type === "unavailable") {
          modelDown = true;
          break;
        }
        problems = ["The answer wasn't valid JSON."];
        continue;
      }
      const parsed = CoachNoteAnswerSchema.safeParse(reply.value);
      if (!parsed.success) {
        problems = ["The answer didn't match the JSON shape asked for."];
        continue;
      }
      const a = parsed.data;
      const checked = checkCoachNote(
        {
          headline: a.headline,
          paragraphs: a.paragraphs,
          factKeys: a.facts,
          fix: { title: a.fix.title, detail: a.fix.detail, factKeys: a.fix.facts },
        },
        facts,
      );
      if (checked.ok) return checked.value;
      problems = checked.error;
      this.deps.logger.warn("weekly_coach_rejected", { attempt, problems });
    }
    throw new AppError("upstream_unavailable", "The coach couldn't write this week's note.", {
      reason: modelDown ? "unavailable" : "failed",
    });
  }

  exportMyData(owner: DataOwner) {
    return this.deps.notes.exportForOwner(owner).then((notes) => ({ weeklyCoachNotes: notes }));
  }

  async deleteMyData(owner: DataOwner) {
    return { weeklyCoachNotes: await this.deps.notes.deleteForOwner(owner) };
  }
}

function parseJob(p: Record<string, unknown>, now: Date): CoachNoteJob | null {
  const { userId, week } = p;
  if (typeof userId !== "string" || !/^[a-f0-9]{24}$/.test(userId)) return null;
  if (!isFinishedCoachWeek(week, now)) return null;
  // A message delivered very late (more than a week) is old news: no note, no push.
  if (week < addDays(lastCoachWeek(now), -7)) return null;
  return { userId, week };
}

function reasonOf(error: AppError): string | null {
  const details = error.details as { reason?: unknown } | undefined;
  return typeof details?.reason === "string" ? details.reason : null;
}
