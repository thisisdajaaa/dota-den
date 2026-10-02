/**
 * Laning and item timings from a parsed replay (pure). Only parsed matches have these; for
 * the rest, the player can ask OpenDota to parse the replay.
 */

export interface Laning {
  /** Physical lane OpenDota assigned (1 bottom, 2 middle, 3 top, 4/5 jungle), when known. */
  lane: number | null;
  /** 1 safe lane, 2 mid, 3 off lane, 4 jungle. */
  laneRole: number | null;
  roaming: boolean;
  /** OpenDota's lane efficiency: share of the lane's possible gold earned in 10 minutes. */
  efficiencyPct: number | null;
  lastHitsAt10: number | null;
  deniesAt10: number | null;
  /** Total gold earned by minute 10 (OpenDota's gold_t), not net worth. */
  goldAt10: number | null;
  observers: number | null;
  sentries: number | null;
  campsStacked: number | null;
  stunsSec: number | null;
  /** Share of team fights taken part in, 0–1. */
  teamfight: number | null;
  /** Items bought, in order (seconds from the horn; negative before it). */
  purchases: Array<{ time: number; key: string }>;
}

/** Per-minute series value at minute 10, or null when the game or series is shorter. */
export function atMinute(series: readonly number[] | null | undefined, minute = 10): number | null {
  return series && series.length > minute ? series[minute] : null;
}

/** The first purchase time of each key item, in order. `isKey` decides what counts. */
export function keyItemTimings(
  purchases: readonly { time: number; key: string }[],
  isKey: (key: string) => boolean,
  limit = 8,
): Array<{ key: string; time: number }> {
  const seen = new Set<string>();
  const out: Array<{ key: string; time: number }> = [];
  for (const p of [...purchases].sort((a, b) => a.time - b.time)) {
    if (seen.has(p.key) || !isKey(p.key)) continue;
    seen.add(p.key);
    out.push({ key: p.key, time: p.time });
    if (out.length >= limit) break;
  }
  return out;
}

/** "12:34", or "-1:20" before the horn. */
export function clockTime(sec: number): string {
  const sign = sec < 0 ? "-" : "";
  const s = Math.abs(Math.round(sec));
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Players on the other team in the same physical lane (lane opponents). */
export function laneOpponents<P extends { side: "radiant" | "dire"; laning: Laning | null }>(
  players: readonly P[],
  player: P,
): P[] {
  const lane = player.laning?.lane;
  if (!lane || lane > 3) return [];
  return players.filter(
    (p) => p.side !== player.side && p.laning?.lane === lane && !p.laning.roaming,
  );
}
