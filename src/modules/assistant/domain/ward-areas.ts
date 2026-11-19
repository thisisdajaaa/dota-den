/**
 * Where a ward spot is, in words a player can find on the map (pure). Spots come as positions
 * on the minimap image (0–1 from the left and from the top; Radiant's base is bottom left,
 * Dire's top right). This only describes geometry: which half of the map and which corner;
 * it doesn't name landmarks it can't be sure of.
 */

export type MapHalf = "radiant" | "dire" | "river";
export type MapArea =
  | "top_left"
  | "top"
  | "top_right"
  | "left"
  | "middle"
  | "right"
  | "bottom_left"
  | "bottom"
  | "bottom_right";

const AREAS: MapArea[][] = [
  ["top_left", "top", "top_right"],
  ["left", "middle", "right"],
  ["bottom_left", "bottom", "bottom_right"],
];

/** Within this distance of the diagonal (top left to bottom right), a spot is on the river. */
const RIVER_BAND = 0.07;

export function wardArea(spot: { left: number; top: number }): { half: MapHalf; area: MapArea } {
  const third = (v: number) => Math.min(2, Math.max(0, Math.floor(v * 3)));
  const area = AREAS[third(spot.top)][third(spot.left)];
  // The river runs from the top-left corner to the bottom-right one (top = left). Radiant is
  // below that line (towards the bottom left), Dire above it.
  const d = spot.top - spot.left;
  const half: MapHalf = Math.abs(d) <= RIVER_BAND ? "river" : d > 0 ? "radiant" : "dire";
  return { half, area };
}
