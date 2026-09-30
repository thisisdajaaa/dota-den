/**
 * How a player did against everyone else on the same hero (pure). The percentiles are
 * OpenDota's: against recent games on that hero, and against games in this match's rank
 * bracket when it gives one. Higher is better for every stat shown here.
 */

export const PERF_STATS = [
  "gold_per_min",
  "xp_per_min",
  "last_hits_per_min",
  "hero_damage_per_min",
  "tower_damage",
  "hero_healing_per_min",
] as const;
export type PerfStat = (typeof PERF_STATS)[number];

export interface Benchmark {
  raw: number;
  /** 0–1: share of games on this hero this player beat. */
  pct: number;
  /** Same, among games at this match's rank; null when not given. */
  pctBracket: number | null;
}
export type PlayerBenchmarks = Partial<Record<PerfStat, Benchmark>>;

export interface PerfLine extends Benchmark {
  stat: PerfStat;
}

const LABELS: Record<PerfStat, string> = {
  gold_per_min: "Gold per minute",
  xp_per_min: "XP per minute",
  last_hits_per_min: "Last hits per minute",
  hero_damage_per_min: "Hero damage per minute",
  tower_damage: "Tower damage",
  hero_healing_per_min: "Healing per minute",
};
export const perfLabel = (s: PerfStat) => LABELS[s];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The stats to show, in a fixed order. Healing only for players who healed. */
export function performanceLines(b: PlayerBenchmarks | null | undefined): PerfLine[] {
  if (!b) return [];
  return PERF_STATS.flatMap((stat) => {
    const v = b[stat];
    if (!v || !Number.isFinite(v.raw) || !Number.isFinite(v.pct)) return [];
    if (stat === "hero_healing_per_min" && v.raw <= 0) return [];
    return [
      {
        stat,
        raw: v.raw,
        pct: clamp01(v.pct),
        pctBracket: v.pctBracket === null ? null : clamp01(v.pctBracket),
      },
    ];
  });
}

/** The clearest strength and weakness, if any stand out from the middle. */
export function performanceHighlights(lines: readonly PerfLine[]): {
  best: PerfLine | null;
  worst: PerfLine | null;
} {
  const sorted = [...lines].sort((a, b) => b.pct - a.pct);
  const best = sorted[0] && sorted[0].pct >= 0.6 ? sorted[0] : null;
  const last = sorted.at(-1);
  const worst = last && last !== best && last.pct <= 0.4 ? last : null;
  return { best, worst };
}

/** "better than 83%" style text for a percentile. */
export function betterThan(pct: number): string {
  const p = Math.round(clamp01(pct) * 100);
  return p >= 100 ? "better than 99%+" : `better than ${p}%`;
}

export function formatPerfValue(stat: PerfStat, raw: number): string {
  if (stat === "tower_damage" || stat === "gold_per_min" || stat === "xp_per_min")
    return Math.round(raw).toLocaleString("en-US");
  if (stat === "last_hits_per_min") return raw.toFixed(1);
  return Math.round(raw).toLocaleString("en-US");
}
