import "server-only";
import { getDb } from "@/common/db/mongo";
import { mmrJournalService } from "@/modules/mmr";
import { sessionService } from "@/modules/sessions";
import { GoalsController } from "./goals.controller";
import { GoalsRepository } from "./goals.repository";
import { GoalsService } from "./goals.service";

export const goalsRepository = new GoalsRepository(getDb);

export const goalsService = new GoalsService({
  repository: goalsRepository,
  sessions: {
    rankedSessions: async (owner) => sessionService.rankedSessions(owner),
  },
  mmr: {
    entryTimes: async (owner) => (await mmrJournalService.list(owner)).map((e) => e.observedAt),
  },
});

export const goalsController = new GoalsController({ service: goalsService });
