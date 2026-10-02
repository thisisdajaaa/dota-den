/**
 * Your build against the pros' (pure). Pro data is a rank per game phase (OpenDota doesn't
 * say how many games its purchase counts come from), yours is the share of your games.
 */

export interface ProItem {
  phase: "mid" | "late";
  itemId: number;
  rank: number;
}

export interface BuildRow extends ProItem {
  key: string;
  /** Share of your games (with purchase data) in which you bought it; 0 if never. */
  yourShare: number;
  /** One of the pros' top two for the phase, and you buy it in under a quarter of games. */
  rarely: boolean;
}

export const RARELY_SHARE = 0.25;

export function buildVsPros(
  pro: readonly ProItem[],
  keyOf: (itemId: number) => string | undefined,
  yourShares: Readonly<Record<string, number>>,
): BuildRow[] {
  const seen = new Set<number>();
  const rows: BuildRow[] = [];
  for (const p of pro) {
    const key = keyOf(p.itemId);
    if (!key || seen.has(p.itemId)) continue;
    seen.add(p.itemId);
    const yourShare = yourShares[key] ?? 0;
    rows.push({ ...p, key, yourShare, rarely: p.rank <= 2 && yourShare < RARELY_SHARE });
  }
  return rows;
}
