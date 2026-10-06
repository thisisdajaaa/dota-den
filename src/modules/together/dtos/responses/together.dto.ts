import type { FriendCandidate } from "../../domain/candidates";
import { type Relation } from "../../domain/relation";
import {
  type BaselineComparison,
  type HeroPair,
  type PairSummary,
  type Trio,
  type Stack,
  type WinRecord,
} from "../../domain/together-stats";
import type { ProviderError, SharedMatch } from "../../together.ports";

export interface SharedMatchRow {
  match: SharedMatch;
  /** null while this match hasn't been analysed yet. */
  relation: Relation | null;
  friendHeroId: number | null;
}

export interface PairAnalysis {
  rows: SharedMatchRow[];
  summary: PairSummary;
  heroPairs: HeroPair[];
  baseline: WinRecord | null;
  comparison: BaselineComparison;
  /** Shared matches not analysed yet (a later visit continues). */
  pending: number;
  /** True when the upstream stopped us early (busy or down); pending ones retry later. */
  interrupted: boolean;
}

export interface TogetherOverview {
  /** Confirmed party games per friend, from matches analysed so far. */
  partyGames: Map<number, number>;
  trios: Trio[];
  /** Best confirmed parties by exactly who was in them. */
  stacks: Stack[];
  /** Games with a friend on your team but no party data: left out of stacks, never "together". */
  unknownPartyGames: number;
}

export interface TogetherCandidates {
  friends: FriendCandidate[];
  overview: TogetherOverview;
  /** Set when OpenDota's teammate list couldn't be loaded (tracked players still show). */
  peersError: ProviderError | null;
}
