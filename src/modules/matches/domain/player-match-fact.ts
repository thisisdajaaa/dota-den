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
  /**
   * Heroes on your team (not yours) and on the other team, from the upstream's lineups.
   * null when the upstream gave no lineup for the match: missing, never guessed.
   */
  allyHeroIds: number[] | null;
  enemyHeroIds: number[] | null;
  provenance: Provenance;
}

/** Radiant slots are 0–127, Dire 128–255 (Dota player_slot bitfield). */
export function sideFromPlayerSlot(playerSlot: number): TeamSide {
  return playerSlot < 128 ? "radiant" : "dire";
}

export function resultFor(side: TeamSide, radiantWin: boolean): MatchResult {
  return (side === "radiant") === radiantWin ? "win" : "loss";
}

export interface Lineups {
  allyHeroIds: number[] | null;
  enemyHeroIds: number[] | null;
}

/**
 * Both lineups from the upstream's slot → hero map, seen from `playerSlot`: allies are the
 * other heroes on your side, enemies the heroes on the other side. Unknown heroes (missing
 * or 0) are left out, never filled in; with no map at all both lineups are null.
 */
export function lineupsFromSlots(
  heroes:
    Readonly<Record<string, { hero_id?: number | null } | null | undefined>> | null | undefined,
  playerSlot: number,
): Lineups {
  if (!heroes) return { allyHeroIds: null, enemyHeroIds: null };
  const mySide = sideFromPlayerSlot(playerSlot);
  const allies = new Set<number>();
  const enemies = new Set<number>();
  for (const [key, entry] of Object.entries(heroes)) {
    const slot = Number(key);
    const heroId = entry?.hero_id;
    if (!Number.isInteger(slot) || slot < 0 || slot > 255 || slot === playerSlot) continue;
    if (typeof heroId !== "number" || !Number.isInteger(heroId) || heroId <= 0) continue;
    (sideFromPlayerSlot(slot) === mySide ? allies : enemies).add(heroId);
  }
  return { allyHeroIds: [...allies], enemyHeroIds: [...enemies] };
}
