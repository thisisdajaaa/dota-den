import "server-only";
import { getDb } from "@/common/db/mongo";
import { getMmrJournal } from "@/modules/mmr";
import { getSessionService } from "@/modules/sessions";
import { GoalsController } from "./goals.controller";
import { GoalsRepository } from "./goals.repository";
import { GoalsService } from "./goals.service";

export const goalsRepository = new GoalsRepository(getDb);

export const goalsService = new GoalsService({
  repository: goalsRepository,
  sessions: {
    rankedSessions: async (owner) => (await getSessionService()).rankedSessions(owner),
  },
  mmr: {
    entryTimes: async (owner) =>
      (await (await getMmrJournal()).list(owner)).map((e) => e.observedAt),
  },
});

export const goalsController = new GoalsController({ service: goalsService });
