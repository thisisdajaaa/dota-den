/**
 * Ward and death positions from a parsed replay (pure). OpenDota reports positions in game
 * cells: x grows left to right (Radiant's side is the left/bottom), y grows bottom to top
 * (Dire at the top). The playable map spans roughly cells 64–192 on both axes.
 */

export type WardKind = "observer" | "sentry";

export interface WardSpot {
  kind: WardKind;
  /** Seconds from the horn (negative before it). */
  placedAt: number;
  /** When it expired or was destroyed, when the replay says. */
  removedAt: number | null;
  x: number;
  y: number;
}

export interface DeathSpot {
  /** Start of the team fight the death happened in. */
  time: number;
  x: number;
  y: number;
}

export interface MapEvents {
  wards: WardSpot[];
  /** Only deaths inside team fights: OpenDota records positions for those alone. */
  teamfightDeaths: DeathSpot[];
}

export const MAP_MIN = 64;
export const MAP_MAX = 192;

/** Position as a share of the map from its left and top edges, clamped to 0–1. */
export function mapPoint(x: number, y: number): { left: number; top: number } {
  const span = MAP_MAX - MAP_MIN;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { left: clamp((x - MAP_MIN) / span), top: clamp(1 - (y - MAP_MIN) / span) };
}

export type MapWindow = "all" | "laning" | "mid" | "late";

export const MAP_WINDOWS: { key: MapWindow; label: string; from: number; to: number }[] = [
  { key: "all", label: "Whole game", from: -Infinity, to: Infinity },
  { key: "laning", label: "Laning (0–10)", from: -Infinity, to: 600 },
  { key: "mid", label: "Mid game (10–30)", from: 600, to: 1800 },
  { key: "late", label: "Late game (30+)", from: 1800, to: Infinity },
];

export function inWindow(time: number, w: MapWindow): boolean {
  const win = MAP_WINDOWS.find((x) => x.key === w)!;
  return time >= win.from && time < win.to;
}

interface LogEntry {
  time: number;
  x?: number | null;
  y?: number | null;
  ehandle?: number | null;
}

/** Placed wards, each paired with its removal (by entity handle) when the replay has it. */
export function wardSpots(
  kind: WardKind,
  placed: readonly LogEntry[] | null | undefined,
  left: readonly LogEntry[] | null | undefined,
): WardSpot[] {
  const removed = new Map<number, number>();
  for (const l of left ?? []) if (l.ehandle != null) removed.set(l.ehandle, l.time);
  return (placed ?? [])
    .filter((p) => typeof p.x === "number" && typeof p.y === "number")
    .map((p) => ({
      kind,
      placedAt: p.time,
      removedAt: p.ehandle != null ? (removed.get(p.ehandle) ?? null) : null,
      x: p.x!,
      y: p.y!,
    }));
}

/** Team fight deaths for one player: `deaths_pos` is `{x: {y: count}}` per fight. */
export function teamfightDeaths(
  fights: ReadonlyArray<{
    start: number;
    deathsPos: Record<string, Record<string, number>> | null;
  }>,
): DeathSpot[] {
  const out: DeathSpot[] = [];
  for (const f of fights) {
    for (const [x, ys] of Object.entries(f.deathsPos ?? {})) {
      for (const [y, n] of Object.entries(ys)) {
        for (let i = 0; i < n; i++) out.push({ time: f.start, x: Number(x), y: Number(y) });
      }
    }
  }
  return out;
}
