import "server-only";
import { getDb } from "@/common/db/mongo";
import { openDotaConfig, openDotaGateway } from "@/common/providers/opendota";
import { matchQueries } from "@/modules/matches";
import { mmrJournalService } from "@/modules/mmr";
import { readReplay } from "./infrastructure/opendota-replay-source";
import { reportGames } from "./infrastructure/opendota-report-source";
import { ReplayReadsRepository } from "./repositories/replay-reads.repository";
import { BattleReportService } from "./services/battle-report.service";

export const replayReadsRepository = new ReplayReadsRepository(getDb);

export const battleReportService = new BattleReportService({
  games: { games: (id, days) => reportGames(openDotaGateway(), openDotaConfig(), id, days) },
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
