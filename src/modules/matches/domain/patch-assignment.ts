/**
 * Assign a match to the patch in effect at its start time (spec §6).
 * Matches close to a patch release are flagged as boundary cases: servers and
 * clients roll over at different times and timeline dates can be approximate.
 */
export interface PatchTimelineEntry {
  name: string;
  releasedAt: Date;
}

export interface PatchAssignment {
  patch: string | null;
  certainty: "confident" | "boundary" | "unknown";
}

export const PATCH_BOUNDARY_MS = 24 * 60 * 60 * 1000;

export function assignPatch(
  startedAt: Date,
  timeline: readonly PatchTimelineEntry[],
  boundaryMs = PATCH_BOUNDARY_MS,
): PatchAssignment {
  const sorted = [...timeline].sort((a, b) => a.releasedAt.getTime() - b.releasedAt.getTime());
  const t = startedAt.getTime();
  let index = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].releasedAt.getTime() <= t) index = i;
    else break;
  }
  if (index === -1) return { patch: null, certainty: "unknown" };

  const current = sorted[index];
  const next = sorted[index + 1];
  const nearCurrentStart = t - current.releasedAt.getTime() < boundaryMs;
  const nearNextStart = next !== undefined && next.releasedAt.getTime() - t < boundaryMs;
  return {
    patch: current.name,
    certainty: nearCurrentStart || nearNextStart ? "boundary" : "confident",
  };
}
