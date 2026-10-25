import { AppError, NotFoundError } from "@/common/errors/app-error";
import type { Logger } from "@/common/logging/logger";
import type { DataOwner } from "@/common/privacy/user-data";
import {
  checkReadPoints,
  PERIOD_READ_VERSION,
  periodFacts,
  type ReadLocale,
  type ReadPoint,
} from "../domain/period-read";
import type { BattleReportView } from "../dtos/responses/battle-report.dto";
import type { PeriodReadsPort, PeriodReader, StoredPeriodRead } from "../report.ports";
import { PeriodReadAnswerSchema } from "../schemas/period-read.schema";

/** Model calls per read: the first answer, and one retry when it fails the checks. */
const MAX_ATTEMPTS = 2;

/** What the report page shows for the AI read before anything is written. */
export type PeriodReadView =
  | { status: "off" | "too_few" | "not_plus" | "available" }
  | { status: "ready"; read: StoredPeriodRead };

/**
 * The battle report's AI read (Plus): 3–5 observations about a period, written by a language
 * model from the report's own numbers and checked against them (the coach's rule). Written
 * only when the player asks; kept per period, game count and language, so opening it again is
 * free and a new game makes a new read possible.
 */
export class PeriodReadService {
  constructor(
    private readonly deps: {
      reader: PeriodReader | null;
      reads: PeriodReadsPort;
      isPlus: (userId: string) => Promise<boolean>;
      /** The global daily model-call budget (shared with the coach and the draft AI). */
      budget: { take(): Promise<boolean> };
      heroName: (heroId: number) => Promise<string>;
      logger: Pick<Logger, "info" | "warn">;
      now?: () => Date;
    },
  ) {}

  private async facts(view: BattleReportView) {
    const names = new Map<number, string>();
    await Promise.all(
      view.report.heroes.map(async (h) => names.set(h.heroId, await this.deps.heroName(h.heroId))),
    );
    return periodFacts(
      {
        report: view.report,
        current: view.current,
        previous: view.previous.totals,
        mmrExact: view.mmrExact,
      },
      (id) => names.get(id) ?? `Hero #${id}`,
    );
  }

  private key(userId: string, view: BattleReportView, locale: ReadLocale) {
    return [userId, view.from, view.to, view.report.games, locale, PERIOD_READ_VERSION].join(":");
  }

  /** The panel's state for this report (a stored read, or whether one can be written). */
  async view(
    user: { id: string },
    view: BattleReportView,
    locale: ReadLocale,
  ): Promise<PeriodReadView> {
    if (!this.deps.reader) return { status: "off" };
    if (view.report.games < 5) return { status: "too_few" };
    const stored = await this.deps.reads.get(this.key(user.id, view, locale)).catch(() => null);
    if (stored) return { status: "ready", read: stored };
    return (await this.deps.isPlus(user.id).catch(() => false))
      ? { status: "available" }
      : { status: "not_plus" };
  }

  /** Writes (or re-opens) the read of this report. */
  async write(
    user: { id: string },
    view: BattleReportView | null,
    locale: ReadLocale,
  ): Promise<{ read: StoredPeriodRead; cached: boolean }> {
    const reader = this.deps.reader;
    if (!reader)
      throw new AppError("upstream_unavailable", "The AI read isn't set up on this server.", {
        reason: "not_configured",
      });
    if (!view) throw new NotFoundError("No games in this period.");
    const key = this.key(user.id, view, locale);
    const stored = await this.deps.reads.get(key);
    if (stored) return { read: stored, cached: true };
    if (!(await this.deps.isPlus(user.id)))
      throw new AppError("forbidden", "The AI read is a Plus feature.", { reason: "plus" });
    const facts = await this.facts(view);
    if (!facts)
      throw new AppError("conflict", "Play a few more games in this period first.", {
        reason: "too_few",
      });

    let problems: string[] = [];
    let points: ReadPoint[] | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !points; attempt++) {
      if (!(await this.deps.budget.take()))
        throw new AppError("upstream_unavailable", "The coach is resting. Try again later.", {
          reason: "resting",
        });
      const reply = await reader.write(
        { from: view.from, to: view.to, facts: facts.facts },
        { locale, problems },
      );
      if (!reply.ok) {
        this.deps.logger.warn("period_read_model_unavailable", { cause: reply.error.cause });
        if (reply.error.type === "unavailable") break;
        problems = ["The answer wasn't valid JSON."];
        continue;
      }
      const parsed = PeriodReadAnswerSchema.safeParse(reply.value);
      if (!parsed.success) {
        problems = ["The answer didn't match the JSON shape asked for."];
        continue;
      }
      const checked = checkReadPoints(
        parsed.data.points.map((p) => ({
          kind: p.kind,
          title: p.title,
          detail: p.detail,
          factKeys: p.facts,
        })),
        facts.facts,
      );
      if (checked.ok) points = checked.value;
      else {
        problems = checked.error;
        this.deps.logger.warn("period_read_rejected", { attempt, problems });
      }
    }
    if (!points)
      throw new AppError("upstream_unavailable", "The coach couldn't write this read.", {
        reason: "failed",
      });
    const read: StoredPeriodRead = {
      key,
      userId: user.id,
      from: view.from,
      to: view.to,
      locale,
      model: reader.model,
      facts: facts.facts,
      points,
      createdAt: this.deps.now?.() ?? new Date(),
    };
    await this.deps.reads.save(read);
    this.deps.logger.info("period_read_written", {
      from: view.from,
      to: view.to,
      points: points.length,
    });
    return { read, cached: false };
  }

  exportMyData(owner: DataOwner) {
    return this.deps.reads.exportForOwner(owner).then((reads) => ({ reportAiReads: reads }));
  }

  async deleteMyData(owner: DataOwner) {
    return { reportAiReads: await this.deps.reads.deleteForOwner(owner) };
  }
}
