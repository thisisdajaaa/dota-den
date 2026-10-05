import "server-only";
import type { DataOwner } from "@/modules/shared/infrastructure/user-data";
import { getDb } from "@/lib/db/mongo";
import { env } from "@/lib/env";
import type { DashboardFact } from "@/modules/matches/application/ports";
import { getMatchQueries } from "@/modules/matches/composition";
import { getMmrJournal } from "@/modules/mmr/composition";
import type { MmrObservationSource, SessionMatchSource } from "./application/ports";
import { SessionService } from "./application/session-service";
import {
  MongoSessionNoteRepository,
  MongoSessionSettingsRepository,
} from "./infrastructure/mongo-session-repositories";
import * as userData from "./infrastructure/user-data";

/**
 * Sessions read other contexts only through their query services: imported matches from
 * Match Intelligence and the user's own MMR entries from the MMR journal.
 */
export async function getSessionService(): Promise<SessionService<DashboardFact>> {
  const db = await getDb();
  const matches: SessionMatchSource<DashboardFact> = {
    async listMatches(accountId32) {
      const queries = await getMatchQueries();
      // Every game type; the query returns the newest 5,000 (older ones don't form sessions).
      const { facts } = await queries.dashboardFacts(
        accountId32,
        { range: "all", mode: "all" },
        new Date(),
      );
      return facts;
    },
  };
  const observations: MmrObservationSource = {
    async list(owner) {
      const entries = await (await getMmrJournal()).list(owner);
      return entries.map((e) => ({ observedAt: e.observedAt, mmr: e.mmr }));
    },
  };
  return new SessionService({
    matches,
    observations,
    notes: new MongoSessionNoteRepository(db),
    settings: new MongoSessionSettingsRepository(db),
    defaultGapMinutes: env().SESSION_DEFAULT_GAP_MINUTES,
  });
}

/** Your data in this part of the app, for "Download your data". */
export async function exportMyData(owner: DataOwner) {
  return userData.exportUserData(await getDb(), owner);
}

/** Deletes (or, where shared with others, anonymises) your data here. Returns counts. */
export async function deleteMyData(owner: DataOwner) {
  return userData.deleteUserData(await getDb(), owner);
}
