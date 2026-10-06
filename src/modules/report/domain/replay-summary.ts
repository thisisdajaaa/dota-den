/**
 * Replay-only parts of the battle report (pure): lane outcomes and map objectives, from
 * parsed matches only. Every aggregate carries its sample; below MIN_REPLAY_GAMES it isn't
 * shown at all.
 */

export const MIN_REPLAY_GAMES = 5;
/** A lane is won or lost when one side earned at least this much more gold by minute 10. */
export const LANE_MARGIN = 1.1;

/** Rune types in OpenDota's `runes` counts: bounty is 5; water (7) and wisdom (8) aren't power runes. */
const BOUNTY_RUNE = "5";
const POWER_RUNES = new Set(["0", "1", "2", "3", "4", "6", "9"]);

export type LaneOutcome = "won" | "even" | "lost";

export interface ReplayPlayer {
  playerSlot: number;
  /** Physical lane (1 bottom, 2 mid, 3 top; 4/5 jungle). */
  lane: number | null;
  roaming: boolean;
  goldAt10: number | null;
  roshanKills: number;
  campsStacked: number;
  /** Enemy observers and sentries destroyed. */
  dewards: number;
  runes: Record<string, number>;
}

export interface ReplaySummary {
  /** Null when there was no lane to compare (jungle, roaming, or no lane opponents). */
  lane: LaneOutcome | null;
  roshanKills: number;
  campsStacked: number;
  dewards: number;
  powerRunes: number;
  bountyRunes: number;
}

const isRadiant = (slot: number) => slot < 128;

/** Your lane (you and lane partners) against the enemies in the same lane, by gold at 10. */
export function laneOutcome(
  players: readonly ReplayPlayer[],
  you: ReplayPlayer,
): LaneOutcome | null {
  if (you.roaming || you.lane === null || you.lane < 1 || you.lane > 3) return null;
  const laners = players.filter((p) => p.lane === you.lane && !p.roaming && p.goldAt10 !== null);
  const ours = laners.filter((p) => isRadiant(p.playerSlot) === isRadiant(you.playerSlot));
  const theirs = laners.filter((p) => isRadiant(p.playerSlot) !== isRadiant(you.playerSlot));
  if (ours.length === 0 || theirs.length === 0) return null;
  const a = ours.reduce((s, p) => s + p.goldAt10!, 0);
  const b = theirs.reduce((s, p) => s + p.goldAt10!, 0);
  if (a >= b * LANE_MARGIN) return "won";
  if (b >= a * LANE_MARGIN) return "lost";
  return "even";
}

export function replaySummary(players: readonly ReplayPlayer[], you: ReplayPlayer): ReplaySummary {
  let powerRunes = 0;
  let bountyRunes = 0;
  for (const [type, n] of Object.entries(you.runes)) {
    if (type === BOUNTY_RUNE) bountyRunes += n;
    else if (POWER_RUNES.has(type)) powerRunes += n;
  }
  return {
    lane: laneOutcome(players, you),
    roshanKills: you.roshanKills,
    campsStacked: you.campsStacked,
    dewards: you.dewards,
    powerRunes,
    bountyRunes,
  };
}

export interface ReplayAggregate {
  /** Parsed games summarised. */
  games: number;
  lanes: { games: number; won: number; even: number; lost: number };
  /** Totals over `games`. */
  totals: Omit<ReplaySummary, "lane">;
}

export function aggregateReplays(summaries: readonly ReplaySummary[]): ReplayAggregate {
  const lanes = { games: 0, won: 0, even: 0, lost: 0 };
  const totals = { roshanKills: 0, campsStacked: 0, dewards: 0, powerRunes: 0, bountyRunes: 0 };
  for (const s of summaries) {
    if (s.lane) {
      lanes.games++;
      lanes[s.lane]++;
    }
    totals.roshanKills += s.roshanKills;
    totals.campsStacked += s.campsStacked;
    totals.dewards += s.dewards;
    totals.powerRunes += s.powerRunes;
    totals.bountyRunes += s.bountyRunes;
  }
  return { games: summaries.length, lanes, totals };
}
