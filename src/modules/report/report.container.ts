import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { sharedAiBudget } from "@/common/llm/call-budget";
import { GroqClient, groqChatUrl } from "@/common/llm/groq-client";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { matchQueries, matchesService } from "@/modules/matches";
import { plusService } from "@/modules/plus";
import { mmrJournalService } from "@/modules/mmr";
import { importedReportGame } from "./infrastructure/imported-report-source";
import { readReplay } from "./infrastructure/opendota-replay-source";
import { reportGames } from "./infrastructure/opendota-report-source";
import { GroqPeriodReader } from "./infrastructure/groq-period-reader";
import { ReportController } from "./report.controller";
import {
  PeriodReadsRepository,
  ReplayReadsRepository,
} from "./repositories/replay-reads.repository";
import { BattleReportService } from "./services/battle-report.service";
import { PeriodReadService } from "./services/period-read.service";

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
    logger,
  });
});

export const reportController = new ReportController({
  report: battleReportService,
  read: () => periodReadService,
});
