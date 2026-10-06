import type { Relation, Seat } from "./domain/relation";

export const TOGETHER_SCHEMA_VERSION = 1;

export const TOGETHER_COLLECTIONS = { matches: "together_matches" } as const;

export interface TogetherMatchDoc {
  matchId: string;
  /** Always the smaller account id of the pair. */
  accountIdA: number;
  accountIdB: number;
  relation: Relation;
  startedAt: Date;
  radiantWin: boolean | null;
  seatA: Seat | null;
  seatB: Seat | null;
  fetchedAt: Date;
  schemaVersion: number;
}
