/**
 * Ward spots (pure): where observer and sentry wards were placed in recent pro games, counted
 * on a coarse grid of the map and split by side and game phase.
 */

export const WARD_SIDES = ["radiant", "dire"] as const;
export type WardSide = (typeof WARD_SIDES)[number];
export const WARD_PHASES = ["early", "mid", "late"] as const;
export type WardPhase = (typeof WARD_PHASES)[number];
export const WARD_KINDS = ["observer", "sentry"] as const;
export type WardKind = (typeof WARD_KINDS)[number];

/** Phase boundaries in seconds of game time (wards before the horn count as early). */
export const WARD_EARLY_UNTIL_SEC = 10 * 60;
export const WARD_MID_UNTIL_SEC = 25 * 60;

/** One grid cell's count, as the source reports it (OpenDota's 0–256 map coordinates). */
export interface WardCell {
  kind: WardKind;
  side: WardSide;
  phase: WardPhase;
  x: number;
  y: number;
  count: number;
}

/** Ward cells from recent pro games, and the patch they were played on (null when unknown). */
export interface WardData {
  cells: WardCell[];
  games: number;
  patch?: string | null;
  currentPatch?: string | null;
}

export interface WardSpot {
  /** Position on the map image, 0–1 from the left and from the top. */
  left: number;
  top: number;
  count: number;
  /** Relative to the most used spot shown (1 = the most used). */
  relative: number;
}

/** The playable map spans these OpenDota coordinates on both axes. */
const MAP_MIN = 64;
const MAP_SIZE = 128;

export function mapPosition(x: number, y: number): { left: number; top: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { left: clamp((x - MAP_MIN) / MAP_SIZE), top: clamp(1 - (y - MAP_MIN) / MAP_SIZE) };
}

/** The most used spots for one side, phase and kind of ward, most used first. */
export function topWardSpots(
  cells: readonly WardCell[],
  pick: { kind: WardKind; side: WardSide; phase: WardPhase },
  limit = 12,
): WardSpot[] {
  const rows = cells
    .filter(
      (c) =>
        c.kind === pick.kind &&
        c.side === pick.side &&
        c.phase === pick.phase &&
        c.count > 0 &&
        Number.isFinite(c.x) &&
        Number.isFinite(c.y),
    )
    .sort((a, b) => b.count - a.count || a.x - b.x || a.y - b.y)
    .slice(0, limit);
  const most = rows[0]?.count ?? 1;
  return rows.map((c) => ({ ...mapPosition(c.x, c.y), count: c.count, relative: c.count / most }));
}

export const isWardSide = (v: unknown): v is WardSide =>
  typeof v === "string" && (WARD_SIDES as readonly string[]).includes(v);
export const isWardPhase = (v: unknown): v is WardPhase =>
  typeof v === "string" && (WARD_PHASES as readonly string[]).includes(v);
export const isWardKind = (v: unknown): v is WardKind =>
  typeof v === "string" && (WARD_KINDS as readonly string[]).includes(v);
