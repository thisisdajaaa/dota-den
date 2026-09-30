/**
 * Medal history (pure). Valve shares a player's medal (rank tier) but not their MMR, so this is
 * the one rank signal that needs no typing: each time we see the medal, we note it if it
 * changed. Changes are exact about the medal, not about MMR, and are dated when we noticed
 * them (they may have happened a little earlier).
 */

export interface MedalSnapshot {
  /** Valve rank tier: tens digit is the medal (1 Herald … 8 Immortal), ones digit the stars. */
  rankTier: number;
  /** When we first saw this medal. */
  observedAt: Date;
  /** When we last confirmed it (defaults to observedAt). */
  lastSeenAt?: Date;
}

export interface MedalChange {
  from: number;
  to: number;
  /** When we first saw the new medal. */
  at: Date;
  /** Last time we saw the old one: the change happened between these. */
  lastSeenBefore: Date;
  direction: "up" | "down";
}

/** A valid Valve rank tier (11–75 with 1–5 stars, or 80 for Immortal). */
export function isRankTier(t: number | null | undefined): t is number {
  if (t === null || t === undefined || !Number.isInteger(t)) return false;
  if (t === 80) return true;
  const medal = Math.floor(t / 10);
  const stars = t % 10;
  return medal >= 1 && medal <= 7 && stars >= 1 && stars <= 5;
}

/** Whether to store a new sighting: only when it differs from the last stored one. */
export function shouldRecord(last: MedalSnapshot | null, rankTier: number | null): boolean {
  return isRankTier(rankTier) && last?.rankTier !== rankTier;
}

/** Changes between consecutive snapshots, newest first. */
export function medalChanges(snapshots: readonly MedalSnapshot[]): MedalChange[] {
  const sorted = [...snapshots].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const out: MedalChange[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.rankTier === cur.rankTier) continue;
    out.push({
      from: prev.rankTier,
      to: cur.rankTier,
      at: cur.observedAt,
      lastSeenBefore: prev.lastSeenAt ?? prev.observedAt,
      direction: cur.rankTier > prev.rankTier ? "up" : "down",
    });
  }
  return out.reverse();
}
