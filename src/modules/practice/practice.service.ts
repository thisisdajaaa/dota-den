import { ConflictError, NotFoundError } from "@/common/errors/app-error";
import type { DataOwner } from "@/common/privacy/user-data";
import { addDays, dayKeyFormatter, type DayKey } from "@/common/time/day-key";
import { periodFor } from "@/modules/mmr/domain/periods";
import { MIN_TILT_DROP, MIN_TILT_GAMES } from "@/modules/sessions/domain/tilt";
import {
  buildPlan,
  dismissStep,
  loggedSessions,
  LOG_LOOKBACK_DAYS,
  pickSwap,
  REVIEW_WINDOW_DAYS,
  stepProgress,
  swapStep,
  type PlanInput,
  type RecentLoss,
} from "./domain/practice-plan";
import type { UpdatePlanDto } from "./dtos/requests/update-plan.dto";
import type { PracticePlanViewDto } from "./dtos/responses/practice-plan.dto";
import type { PracticePlan } from "./practice.model";
import type {
  HeroAdviceSource,
  MmrLogSource,
  PlanGame,
  PracticeRepositoryPort,
  RankedSessionsSource,
  ReviewSource,
  TiltSource,
} from "./practice.ports";

export interface PracticeServiceDeps {
  repository: PracticeRepositoryPort;
  sessions: RankedSessionsSource;
  mmr: MmrLogSource;
  tilt: TiltSource;
  heroes: HeroAdviceSource;
  reviews: ReviewSource;
  now?: () => Date;
  /** Hero advice comes from OpenDota; past this the plan is built without it (and not kept). */
  adviceTimeoutMs?: number;
}

type Sessions = Awaited<ReturnType<RankedSessionsSource["rankedSessions"]>>;

/** A basic plan nobody touched is rebuilt after this long, in case new data supports more. */
const BASIC_PLAN_REFRESH_MS = 24 * 3_600_000;
/** Most recent losses checked for one that hasn't been reviewed yet. */
const LOSSES_CHECKED = 5;
const DAY_MS = 86_400_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

/** The weekly practice plan: built once a week from the player's data, ticked by their games. */
export class PracticeService {
  constructor(private readonly deps: PracticeServiceDeps) {}

  private context(timeZone: string) {
    const now = this.deps.now?.() ?? new Date();
    const dayKey = dayKeyFormatter(timeZone);
    const today = dayKey(now);
    return { now, dayKey, week: periodFor("week", today, today, null) };
  }

  /** This week's plan with progress, or null before the player has any ranked games. */
  async weekView(owner: DataOwner, timeZone: string): Promise<PracticePlanViewDto | null> {
    const ctx = this.context(timeZone);
    const [stored, sessions, mmrEntries] = await Promise.all([
      this.deps.repository.find(owner.userId, ctx.week.from),
      this.deps.sessions.rankedSessions(owner),
      this.deps.mmr.entryTimes(owner),
    ]);
    if (sessions.length === 0) return null;
    const plan = await this.planFor(owner, ctx, stored, sessions, mmrEntries);
    return this.view(owner, plan, ctx, sessions, mmrEntries);
  }

  /** Swaps a step for another suggestion or dismisses it; the plan is then kept as edited. */
  async update(
    owner: DataOwner,
    timeZone: string,
    input: UpdatePlanDto,
  ): Promise<PracticePlanViewDto> {
    const ctx = this.context(timeZone);
    const [stored, sessions, mmrEntries] = await Promise.all([
      this.deps.repository.find(owner.userId, ctx.week.from),
      this.deps.sessions.rankedSessions(owner),
      this.deps.mmr.entryTimes(owner),
    ]);
    if (sessions.length === 0) throw new NotFoundError("No practice plan this week");
    const plan = await this.planFor(owner, ctx, stored, sessions, mmrEntries);
    if (!plan.steps.some((s) => s.id === input.stepId))
      throw new NotFoundError("That step isn't in this week's plan");
    const next =
      input.action === "swap" ? swapStep(plan, input.stepId) : dismissStep(plan, input.stepId);
    if (!next) throw new ConflictError("No other suggestion for this step");
    const saved: PracticePlan = { ...next, edited: true, updatedAt: ctx.now };
    await this.deps.repository.save(saved);
    return this.view(owner, saved, ctx, sessions, mmrEntries);
  }

  /** The stored plan, or a new one (stored once its sources answered). */
  private async planFor(
    owner: DataOwner,
    ctx: ReturnType<PracticeService["context"]>,
    stored: PracticePlan | null,
    sessions: Sessions,
    mmrEntries: Date[],
  ): Promise<PracticePlan> {
    const fresh = (p: PracticePlan) =>
      p.personal || p.edited || ctx.now.getTime() - p.createdAt.getTime() < BASIC_PLAN_REFRESH_MS;
    if (stored && fresh(stored)) return stored;

    const { input, complete } = await this.gather(owner, ctx, sessions, mmrEntries);
    const built = buildPlan(input);
    const plan: PracticePlan = {
      userId: owner.userId,
      week: ctx.week.from,
      ...built,
      edited: false,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    // Without hero advice (OpenDota down or slow) show this plan but try again next time.
    if (!complete) return stored ?? plan;
    if (stored) {
      await this.deps.repository.save(plan);
      return plan;
    }
    return this.deps.repository.insertIfAbsent(plan);
  }

  private async gather(
    owner: DataOwner,
    ctx: ReturnType<PracticeService["context"]>,
    sessions: Sessions,
    mmrEntries: Date[],
  ): Promise<{ input: PlanInput; complete: boolean }> {
    const since = ctx.now.getTime() - REVIEW_WINDOW_DAYS * DAY_MS;
    const recentLosses = sessions
      .flatMap((s) => s.matches)
      .filter((g) => g.result === "loss" && g.startedAt.getTime() >= since)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, LOSSES_CHECKED);

    const [advice, tilt, reviewed] = await Promise.all([
      withTimeout(this.deps.heroes.advice(owner.accountId32), this.deps.adviceTimeoutMs ?? 4000, {
        status: "unavailable" as const,
      }),
      this.deps.tilt.tilt(owner).catch(() => null),
      this.deps.reviews
        .reviewed(
          owner.userId,
          recentLosses.map((g) => g.matchId),
        )
        .catch(() => new Set<string>()),
    ]);

    const lookbackFrom = addDays(ctx.week.from, -LOG_LOOKBACK_DAYS);
    const before = this.inDays(sessions, ctx.dayKey, lookbackFrom, addDays(ctx.week.from, -1));

    return {
      complete: advice.status !== "unavailable",
      input: {
        heroes: advice.status === "unavailable" ? null : advice,
        tilt: tilt && {
          after: tilt.afterTwo,
          baseline: tilt.baseline,
          backed:
            tilt.afterTwo.games >= MIN_TILT_GAMES &&
            tilt.baseline.rate - tilt.afterTwo.rate >= MIN_TILT_DROP,
          minGames: MIN_TILT_GAMES,
        },
        losses: recentLosses.filter((g) => !reviewed.has(g.matchId)).map(toLoss),
        logging: { sessions: before.length, logged: loggedSessions(before, mmrEntries) },
      },
    };
  }

  private inDays(sessions: Sessions, dayKey: (d: Date) => DayKey, from: DayKey, to: DayKey) {
    return sessions
      .filter((s) => {
        const k = dayKey(s.startedAt);
        return k >= from && k <= to;
      })
      .map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt, games: s.matches }));
  }

  private async view(
    owner: DataOwner,
    plan: PracticePlan,
    ctx: ReturnType<PracticeService["context"]>,
    sessions: Sessions,
    mmrEntries: Date[],
  ): Promise<PracticePlanViewDto> {
    const toReview = plan.steps.flatMap((s) => (s.kind === "reviewLoss" ? [s.matchId] : []));
    const reviewed = toReview.length
      ? await this.deps.reviews.reviewed(owner.userId, toReview).catch(() => new Set<string>())
      : new Set<string>();
    const week = {
      sessions: this.inDays(sessions, ctx.dayKey, ctx.week.from, ctx.week.to),
      mmrEntries,
      reviewed,
    };
    return {
      week: plan.week,
      personal: plan.personal,
      gaps: plan.gaps,
      steps: plan.steps.map((step) => ({
        step,
        ...stepProgress(step, week),
        canSwap: pickSwap(plan, step.id) !== null,
      })),
    };
  }

  async exportMyData(owner: DataOwner) {
    return { practicePlans: await this.deps.repository.exportForOwner(owner) };
  }

  async deleteMyData(owner: DataOwner) {
    return { practicePlans: await this.deps.repository.deleteForOwner(owner) };
  }
}

const toLoss = (g: PlanGame): RecentLoss => ({
  matchId: g.matchId,
  heroId: g.heroId,
  startedAt: g.startedAt,
  kills: g.kills,
  deaths: g.deaths,
  assists: g.assists,
});
