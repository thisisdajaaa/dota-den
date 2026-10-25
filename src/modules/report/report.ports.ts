import type { DataOwner } from "@/common/privacy/user-data";
import type { RankedResultRow } from "@/modules/matches/domain/read-models";
import type { ReportGame } from "./domain/battle-report";
import type { ReplaySummary } from "./domain/replay-summary";
import type { ReadLocale, ReadPoint } from "./domain/period-read";
import type { Result } from "@/common/result";
import type { GroundFact } from "@/common/utils/grounding";

/** A player's games over the last `days` days (public OpenDota data); null when unavailable. */
export interface ReportGamesSource {
  games(accountId32: number, days: number): Promise<ReportGame[] | null>;
}

/**
 * Your games imported by the match sync, between two instants: the fallback when OpenDota
 * can't be read. They carry no per-game GPM, damage or lane data, and no replay flag.
 */
export interface ImportedGamesSource {
  games(accountId32: number, range: { from: Date; to: Date }): Promise<ReportGame[]>;
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

export type PeriodReaderError =
  { type: "unavailable"; cause: string } | { type: "invalid_response"; cause: string };

/** The language model behind the AI read. Returns its JSON unvalidated (the service checks it). */
export interface PeriodReader {
  readonly model: string;
  write(
    input: { from: string; to: string; facts: readonly GroundFact[] },
    opts: { locale: ReadLocale; problems?: readonly string[] },
  ): Promise<Result<unknown, PeriodReaderError>>;
}

/** A written AI read of one period, kept so it's shown again for free. */
export interface StoredPeriodRead {
  /** `${userId}:${from}:${to}:${games}:${locale}:${version}` */
  key: string;
  userId: string;
  from: string;
  to: string;
  locale: ReadLocale;
  model: string;
  facts: GroundFact[];
  points: ReadPoint[];
  createdAt: Date;
}

export interface PeriodReadsPort {
  get(key: string): Promise<StoredPeriodRead | null>;
  save(read: StoredPeriodRead): Promise<void>;
  exportForOwner(owner: DataOwner): Promise<Record<string, unknown>[]>;
  deleteForOwner(owner: DataOwner): Promise<number>;
}
