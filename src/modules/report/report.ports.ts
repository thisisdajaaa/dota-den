import type { DataOwner } from "@/common/privacy/user-data";
import type { RankedResultRow } from "@/modules/matches/domain/read-models";
import type { ReportGame } from "./domain/battle-report";
import type { ReplaySummary } from "./domain/replay-summary";

/** A player's games over the last `days` days (public OpenDota data); null when unavailable. */
export interface ReportGamesSource {
  games(accountId32: number, days: number): Promise<ReportGame[] | null>;
}

/** One parsed match's lane outcome and objectives for the player; null when unreadable. */
export interface ReplaySource {
  read(matchId: string, accountId32: number): Promise<ReplaySummary | null>;
}

export interface ReplayReadsPort {
  find(accountId32: number, matchIds: readonly string[]): Promise<Map<string, ReplaySummary>>;
  save(matchId: string, accountId32: number, s: ReplaySummary): Promise<void>;
  countForOwner(owner: DataOwner): Promise<number>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}

/** The MMR journal's entries and our imported ranked results (for the exact MMR change). */
export interface ReportMmrSource {
  entries(owner: DataOwner): Promise<Array<{ observedAt: Date; mmr: number }>>;
  rankedResults(accountId32: number, range: { from: Date; to: Date }): Promise<RankedResultRow[]>;
}
