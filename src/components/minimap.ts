/**
 * Valve's minimap art per patch, cropped to the playable area so OpenDota's 64–192 map
 * coordinates line up with 0–100% of the image (the same framing OpenDota's map art uses).
 * Terrain moves between patches, so ward spots go on the map of the patch they're from.
 */
const MINIMAPS: Record<string, string> = {
  "7.41": "/maps/minimap-7.41.webp",
  "7.42": "/maps/minimap-7.42.webp",
};
export const LATEST_MINIMAP_PATCH = "7.42";

/** The map for a patch ("7.41f" uses 7.41's), or the latest map when there's none for it. */
export function minimapFor(patch: string | null | undefined): { src: string; patch: string } {
  const base = patch?.replace(/[a-z]$/, "") ?? "";
  if (base in MINIMAPS) return { src: MINIMAPS[base], patch: base };
  return { src: MINIMAPS[LATEST_MINIMAP_PATCH], patch: LATEST_MINIMAP_PATCH };
}

/** When each map above went live (Valve's patch dates); earlier games have no map art here. */
const MINIMAP_SINCE: Array<{ patch: string; since: number }> = [
  { patch: "7.42", since: Date.UTC(2026, 10, 18, 21, 0) },
  { patch: "7.41", since: Date.UTC(2026, 2, 24, 0, 0) },
];

/** The map art for a game played at `when`, or null when it predates the maps we have. */
export function minimapAt(when: Date): { src: string; patch: string } | null {
  const hit = MINIMAP_SINCE.find((m) => when.getTime() >= m.since);
  return hit ? { src: MINIMAPS[hit.patch], patch: hit.patch } : null;
}
