import "server-only";
import { getDb } from "@/common/db/mongo";
import { advisorService } from "@/modules/advisor";
import { annotationsService } from "@/modules/annotations";
import { mmrJournalService } from "@/modules/mmr";
import { sessionService } from "@/modules/sessions";
import { REVIEWED_TAG } from "./domain/practice-plan";
import { PracticeController } from "./practice.controller";
import { PracticeRepository } from "./practice.repository";
import { PracticeService } from "./practice.service";

export const practiceRepository = new PracticeRepository(getDb);

/** Other features are read inside closures only (ADR 0009: no init cycles). */
export const practiceService = new PracticeService({
  repository: practiceRepository,
  sessions: {
    rankedSessions: async (owner) => sessionService.rankedSessions(owner),
  },
  mmr: {
    entryTimes: async (owner) => (await mmrJournalService.list(owner)).map((e) => e.observedAt),
  },
  tilt: {
    async tilt(owner) {
      const { stats } = await sessionService.tilt(owner);
      return { baseline: stats.baseline, afterTwo: stats.afterLosses[2] };
    },
  },
  heroes: {
    async advice(accountId32) {
      const view = await advisorService.poolAdvice(accountId32);
      if (view.status !== "ok") return { status: view.status };
      return {
        status: "ok",
        position: view.position,
        picks: view.advice.map((a) => {
          const counter = a.counters[0];
          const nemesis = counter && view.nemeses.find((n) => n.heroId === counter.nemesisId);
          return {
            heroId: a.heroId,
            highRank: a.highRank,
            contestRate: a.contestRate,
            counter:
              counter && nemesis
                ? {
                    nemesisId: counter.nemesisId,
                    yourLossRate: counter.yourLossRate,
                    yourGames: nemesis.games,
                  }
                : null,
          };
        }),
      };
    },
  },
  reviews: {
    async reviewed(userId, matchIds) {
      const notes = await Promise.all(
        matchIds.map(async (id) => [id, await annotationsService.get(userId, id)] as const),
      );
      return new Set(
        notes
          .filter(([, a]) => a.note.trim() !== "" || a.tags.includes(REVIEWED_TAG))
          .map(([id]) => id),
      );
    },
  },
});

export const practiceController = new PracticeController({ service: practiceService });
