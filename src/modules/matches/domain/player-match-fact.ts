import type { QueueClassification } from "./queue-classification";
import type { PatchAssignment } from "./patch-assignment";

export type MatchResult = "win" | "loss";
export type TeamSide = "radiant" | "dire";

/** Provenance is required on every imported fact (spec §4A). */
export interface Provenance {
  provider: "opendota";
  fetchedAt: Date;
  /** Upstream replay-parse state, when known. */
  parseStatus: "parsed" | "unparsed" | "unknown";
}

/** One player's view of one match. Unique by (accountId32, matchId). */
export interface PlayerMatchFact {
  accountId32: number;
  matchId: string;
  startedAt: Date;
  durationSec: number;
  heroId: number;
  side: TeamSide;
  result: MatchResult;
  kills: number;
  deaths: number;
  assists: number;
  gameMode: number | null;
  lobbyType: number | null;
  ranked: boolean;
  /** Only set when inferred confidently; M1 never infers roles. */
  role: null;
  queue: QueueClassification;
  patch: PatchAssignment;
  averageRankTier: number | null;
  provenance: Provenance;
}

/** Radiant slots are 0–127, Dire 128–255 (Dota player_slot bitfield). */
export function sideFromPlayerSlot(playerSlot: number): TeamSide {
  return playerSlot < 128 ? "radiant" : "dire";
}

export function resultFor(side: TeamSide, radiantWin: boolean): MatchResult {
  return (side === "radiant") === radiantWin ? "win" : "loss";
}
