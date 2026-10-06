import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { GroqClient } from "@/common/llm/groq-client";
import { logger } from "@/common/logging/logger";
import { lazy } from "@/common/utils/lazy";
import { getMatchQueries } from "@/modules/matches/composition";
import { GroqScreenshotReader } from "./infrastructure/groq-screenshot-reader";
import { MmrController } from "./mmr.controller";
import { MedalHistoryRepository } from "./repositories/medal-history.repository";
import { MmrEntriesRepository } from "./repositories/mmr-entries.repository";
import { MedalService } from "./services/medals.service";
import { MmrInsightsService } from "./services/mmr-insights.service";
import { MmrJournalService } from "./services/mmr-journal.service";
import { ScreenshotService } from "./services/screenshot.service";

export const mmrEntriesRepository = new MmrEntriesRepository(getDb);
export const medalHistoryRepository = new MedalHistoryRepository(getDb);

export const mmrJournalService = new MmrJournalService(mmrEntriesRepository, undefined, {
  entries: mmrEntriesRepository,
  medals: medalHistoryRepository,
});

export const medalService = new MedalService({ store: medalHistoryRepository, logger });

export const mmrInsightsService = new MmrInsightsService({
  journal: mmrJournalService,
  medals: medalHistoryRepository,
  ranked: {
    rankedResults: async (id, range) => (await getMatchQueries()).rankedResults(id, range),
  },
});

/** Reading MMR from screenshots needs an AI provider (GROQ_API_KEY); without one it's off. */
export const screenshotService = lazy(() => {
  const { GROQ_API_KEY, MMR_VISION_MODEL } = env();
  return new ScreenshotService({
    reader: GROQ_API_KEY
      ? new GroqScreenshotReader(new GroqClient({ apiKey: GROQ_API_KEY }), {
          model: MMR_VISION_MODEL,
        })
      : null,
    logger,
  });
});

export const mmrController = new MmrController({
  journal: mmrJournalService,
  screenshots: screenshotService,
});
