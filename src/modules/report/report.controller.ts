import "server-only";
import { handler } from "@/common/http/controller";
import { getViewerTimeZone } from "@/common/http/request-context";
import { ServiceResponse } from "@/common/http/service-response";
import { getLocale } from "@/common/i18n/server";
import { dayKeyFormatter } from "@/common/time/day-key";
import { requireUser } from "@/modules/identity";
import { parseReportRange } from "./domain/report-range";
import type { PeriodReadDto } from "./dtos/responses/period-read.dto";
import { PeriodReadRequestSchema } from "./schemas/period-read.schema";
import { WeeklyCoachRequestSchema } from "./schemas/weekly-coach.schema";
import type { BattleReportService } from "./services/battle-report.service";
import type { PeriodReadService } from "./services/period-read.service";
import type { WeeklyCoachService } from "./services/weekly-coach.service";
import { toCoachNoteDto } from "./dtos/responses/weekly-coach.dto";

/** The battle report's API: the AI read of a period and the weekly coach note (Plus). */
export class ReportController {
  constructor(
    private readonly deps: {
      report: BattleReportService;
      read: () => PeriodReadService;
      coach: () => WeeklyCoachService;
    },
  ) {}

  /** POST /api/v1/report/read: the AI read of the report's period (written, or stored). */
  read = handler(
    {
      guard: requireUser,
      // Each new read is a model call (or two): a few an hour is plenty.
      rateLimit: { name: "report-read", limit: 10, windowMs: 3_600_000 },
      body: PeriodReadRequestSchema,
      invalidMessage: "Invalid period",
    },
    async ({ user, body }) => {
      const { timeZone } = await getViewerTimeZone();
      const range = parseReportRange(
        { from: body.from, to: body.to },
        dayKeyFormatter(timeZone)(new Date()),
      );
      const owner = { userId: user.id, accountId32: user.accountId32 };
      const view = await this.deps.report.report(owner, range, timeZone);
      const { read, cached } = await this.deps.read().write(user, view, await getLocale());
      const dto: PeriodReadDto = {
        points: read.points,
        facts: read.facts,
        createdAt: read.createdAt.toISOString(),
        cached,
      };
      return ServiceResponse.success(dto);
    },
  );

  /**
   * POST /api/v1/report/weekly-coach: the weekly coach note for a finished week (the last one
   * by default), written now in the viewer's language or the one already stored.
   */
  weeklyCoach = handler(
    {
      guard: requireUser,
      rateLimit: { name: "report-weekly-coach", limit: 10, windowMs: 3_600_000 },
      body: WeeklyCoachRequestSchema,
      invalidMessage: "Invalid week",
    },
    async ({ user, body }) => {
      const coach = this.deps.coach();
      const week = body.week ?? coach.currentWeek();
      const result = await coach.write(user, week, await getLocale());
      return ServiceResponse.success(
        result.status === "no_games"
          ? { status: "no_games" as const, week }
          : { status: result.status, note: toCoachNoteDto(result.note) },
      );
    },
  );
}
