import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { sharedAiBudget } from "@/common/llm/call-budget";
import { GroqClient, groqChatUrl } from "@/common/llm/groq-client";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { DEFAULT_LOCALE, isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES, type Messages } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { usersService } from "@/modules/identity";
import { jobsService } from "@/modules/jobs";
import { notificationService } from "@/modules/notifications";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { matchQueries, matchesService } from "@/modules/matches";
import { plusService } from "@/modules/plus";
import { mmrJournalService } from "@/modules/mmr";
import { importedReportGame } from "./infrastructure/imported-report-source";
import { readReplay } from "./infrastructure/opendota-replay-source";
import { reportGames } from "./infrastructure/opendota-report-source";
import { GroqPeriodReader } from "./infrastructure/groq-period-reader";
import { GroqWeeklyCoach } from "./infrastructure/groq-weekly-coach";
import { ReportController } from "./report.controller";
import {
  CoachNotesRepository,
  PeriodReadsRepository,
  ReplayReadsRepository,
} from "./repositories/replay-reads.repository";
import { BattleReportService } from "./services/battle-report.service";
import { PeriodReadService } from "./services/period-read.service";
import { WeeklyCoachService } from "./services/weekly-coach.service";
import { YearReviewService } from "./services/year-review.service";
import { addDays } from "@/common/time/day-key";
import { usageService } from "@/modules/usage";

export const replayReadsRepository = new ReplayReadsRepository(getDb);

export const battleReportService = new BattleReportService({
  games: { games: (id, days) => reportGames(openDotaGateway(), openDotaConfig(), id, days) },
  imported: {
    games: async (id, range) =>
      (await matchQueries.factsBetween(id, range)).map(importedReportGame),
  },
  replays: {
    read: (matchId, id) => readReplay(openDotaGateway(), openDotaConfig(), matchId, id),
  },
  reads: replayReadsRepository,
  mmr: {
    entries: async (owner) =>
      (await mmrJournalService.list(owner)).map((e) => ({ observedAt: e.observedAt, mmr: e.mmr })),
    rankedResults: (id, range) => matchQueries.rankedResults(id, range),
  },
});

/** Your year in Dota: imported games only (no OpenDota calls). */
export const yearReviewService = new YearReviewService({
  games: {
    games: async (id, range) =>
      (await matchQueries.factsBetween(id, range)).map((f) => ({
        matchId: f.matchId,
        startedAt: f.startedAt,
        durationSec: f.durationSec,
        heroId: f.heroId,
        won: f.result === "win",
        kills: f.kills,
        deaths: f.deaths,
        assists: f.assists,
        ranked: f.ranked,
        queueClass: f.queueClass,
      })),
    firstStartedAt: (id) => matchQueries.firstStartedAt(id),
  },
});

export const periodReadsRepository = new PeriodReadsRepository(getDb);

/** The battle report's AI read (Plus), on the coach's model and the shared daily AI budget. */
export const periodReadService = lazy(() => {
  const e = env();
  const apiKey = e.MATCH_COACH_API_KEY ?? e.GROQ_API_KEY;
  return new PeriodReadService({
    reader:
      apiKey && e.MATCH_COACH_ENABLED
        ? new GroqPeriodReader(new GroqClient({ apiKey, url: groqChatUrl(e.GROQ_BASE_URL) }), {
            model: e.MATCH_COACH_MODEL ?? e.DRAFT_AI_MODEL,
            timeoutMs: e.MATCH_COACH_TIMEOUT_MS,
          })
        : null,
    reads: periodReadsRepository,
    isPlus: (userId) => plusService.isPlus(userId),
    budget: sharedAiBudget(e.DRAFT_AI_BUDGET_PER_DAY),
    heroName: async (id) => (await matchesService.heroMap()).get(id)?.name ?? `Hero #${id}`,
    used: (userId) => usageService.record("period_read", userId),
    logger,
  });
});

export const coachNotesRepository = new CoachNotesRepository(getDb);

/** The player's interface language (the note and the push are written in it). */
async function playerLocale(userId: string) {
  const [user] = await usersService.findByIds([userId]);
  if (!user) return null;
  const language = user.settings.language;
  return { user, locale: isLocale(language) ? language : DEFAULT_LOCALE };
}

/**
 * The Monday AI weekly coach (Plus): the coach's model and the shared daily AI budget, one
 * job per player (the jobs feature), and a push through notifications. Everything here is
 * resolved when used: jobs imports this feature too.
 */
export const weeklyCoachService = lazy((): WeeklyCoachService => {
  const e = env();
  const apiKey = e.MATCH_COACH_API_KEY ?? e.GROQ_API_KEY;
  return new WeeklyCoachService({
    writer:
      apiKey && e.MATCH_COACH_ENABLED
        ? new GroqWeeklyCoach(new GroqClient({ apiKey, url: groqChatUrl(e.GROQ_BASE_URL) }), {
            model: e.MATCH_COACH_MODEL ?? e.DRAFT_AI_MODEL,
            timeoutMs: e.MATCH_COACH_TIMEOUT_MS,
          })
        : null,
    notes: coachNotesRepository,
    isPlus: (userId) => plusService.isPlus(userId),
    plusUserIds: () => plusService.plusUserIds(),
    wants: async (userId) => (await notificationService.prefs(userId)).weekly_coach,
    user: async (userId) => {
      const found = await playerLocale(userId);
      return found ? { accountId32: found.user.accountId32, locale: found.locale } : null;
    },
    report: (owner, range, timeZone) => battleReportService.report(owner, range, timeZone),
    enqueue: (job): Promise<void> => jobsService.enqueueWeeklyCoachNote(job),
    notify: async (userId, news) => {
      const found = await playerLocale(userId);
      const t = translator<Messages>(MESSAGES[found?.locale ?? DEFAULT_LOCALE], englishMessages);
      return notificationService.notifyOnce(userId, "weekly_coach", news.week, async () => ({
        title: t("notifications.push.weeklyCoach.title"),
        body: t("notifications.push.weeklyCoach.body", { fix: news.fix }),
        // The report for that week, opened at the note.
        url: `/report?from=${news.week}&to=${addDays(news.week, 6)}#weekly-coach`,
        tag: `weekly-coach-${news.week}`,
      }));
    },
    budget: sharedAiBudget(e.DRAFT_AI_BUDGET_PER_DAY),
    heroName: async (id) => (await matchesService.heroMap()).get(id)?.name ?? `Hero #${id}`,
    used: (userId) => usageService.record("weekly_coach", userId),
    logger,
  });
});

export const reportController = new ReportController({
  report: battleReportService,
  read: () => periodReadService,
  coach: () => weeklyCoachService,
});
