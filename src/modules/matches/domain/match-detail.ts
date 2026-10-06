import type { MapEvents } from "./match-map";
import type { Laning } from "./match-laning";
import type { PlayerBenchmarks } from "./match-performance";
import type { TeamSide } from "./player-match-fact";

/** One player's line in a full match scoreboard. Parsed-only stats are null when unparsed. */
export interface MatchPlayer {
  playerSlot: number;
  side: TeamSide;
  /** null for anonymous players (upstream privacy); never guessed. */
  accountId32: number | null;
  personaName: string | null;
  heroId: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  goldPerMin: number;
  xpPerMin: number;
  netWorth: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
  heroHealing: number | null;
  /** Six inventory slots in order; null for an empty slot. */
  items: Array<number | null>;
  backpack: Array<number | null>;
  neutralItem: number | null;
  hasScepter: boolean;
  hasShard: boolean;
  partyId: number | null;
  partySize: number | null;
  rankTier: number | null;
  /** Percentiles against others on the same hero (OpenDota); null when not given. */
  benchmarks: PlayerBenchmarks | null;
  /** Laning, wards and item timings: parsed replays only, else null. */
  laning: Laning | null;
  /** Wards and team fight deaths, parsed replays only. */
  map: MapEvents | null;
}

export interface MatchDetail {
  matchId: string;
  startedAt: Date;
  durationSec: number;
  radiantWin: boolean;
  radiantScore: number;
  direScore: number;
  gameMode: number | null;
  lobbyType: number | null;
  region: number | null;
  firstBloodSec: number | null;
  /** True when a replay parse is available (advantage graphs, damage, etc.). */
  parsed: boolean;
  /** Per-minute Radiant advantage; positive = Radiant ahead. */
  goldAdvantage: number[] | null;
  xpAdvantage: number[] | null;
  players: MatchPlayer[];
  fetchedAt: Date;
}

export interface PartyGroup {
  partyId: number;
  side: TeamSide;
  /** 1-based display number, stable by first player slot. */
  label: number;
  playerSlots: number[];
}

/**
 * Parties as reported upstream: players sharing a party_id on the same team.
 * Solo players (no id, party_size < 2, or a group of one) are not a party. Never inferred from co-occurrence.
 */
export function partyGroups(players: readonly MatchPlayer[]): PartyGroup[] {
  const groups = new Map<string, PartyGroup>();
  for (const p of [...players].sort((a, b) => a.playerSlot - b.playerSlot)) {
    // A reported party_size of 1 means queued alone, whatever the id.
    if (p.partyId === null || p.partySize === null || p.partySize < 2) continue;
    const key = `${p.side}:${p.partyId}`;
    const g = groups.get(key) ?? { partyId: p.partyId, side: p.side, label: 0, playerSlots: [] };
    g.playerSlots.push(p.playerSlot);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.playerSlots.length > 1)
    .map((g, i) => ({ ...g, label: i + 1 }));
}
