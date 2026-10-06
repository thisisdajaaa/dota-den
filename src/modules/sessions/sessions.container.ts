import "server-only";
import { env } from "@/common/config/env";
import { getDb } from "@/common/db/mongo";
import { lazy } from "@/common/utils/lazy";
import type { DashboardFact } from "@/modules/matches/application/ports";
import { getMatchQueries } from "@/modules/matches/composition";
import { getMmrJournal } from "@/modules/mmr";
import {
  SessionNotesRepository,
  SessionSettingsRepository,
} from "./repositories/sessions.repository";
import { SessionsController } from "./sessions.controller";
import { SessionService } from "./sessions.service";

export const sessionNotesRepository = new SessionNotesRepository(getDb);
export const sessionSettingsRepository = new SessionSettingsRepository(getDb);

/**
 * Sessions read other features only through their query services: imported matches from
 * the matches feature and the user's own MMR entries from the MMR journal.
 */
export const sessionService = lazy(
  () =>
    new SessionService<DashboardFact>({
      matches: {
        async listMatches(accountId32) {
          // Every game type; the query returns the newest 5,000 (older ones don't form sessions).
          const { facts } = await (
            await getMatchQueries()
          ).dashboardFacts(accountId32, { range: "all", mode: "all" }, new Date());
          return facts;
        },
      },
      observations: {
        async list(owner) {
          const entries = await (await getMmrJournal()).list(owner);
          return entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr }));
        },
      },
      notes: sessionNotesRepository,
      settings: sessionSettingsRepository,
      defaultGapMinutes: env().SESSION_DEFAULT_GAP_MINUTES,
      data: { notes: sessionNotesRepository, settings: sessionSettingsRepository },
    }),
);

export const sessionsController = new SessionsController({ service: sessionService });
