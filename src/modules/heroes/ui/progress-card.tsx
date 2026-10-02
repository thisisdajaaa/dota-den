import { cn } from "cn";
import type { HeroProgress, ProgressStat } from "../domain/hero-progress";
import { MetaSection } from "@/modules/meta/ui/meta-section";

const LABEL: Record<ProgressStat, string> = {
  gpm: "Gold per minute",
  xpm: "XP per minute",
  lhpm: "Last hits per minute",
  kda: "KDA ratio",
  winRate: "Win rate",
};

function show(stat: ProgressStat, v: number): string {
  if (stat === "winRate") return `${(v * 100).toFixed(0)}%`;
  if (stat === "lhpm" || stat === "kda") return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}

function change(stat: ProgressStat, earlier: number, latest: number): string {
  const d = latest - earlier;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  if (stat === "winRate") return `${sign}${Math.abs(d * 100).toFixed(0)} pts`;
  if (earlier === 0) return `${sign}${show(stat, Math.abs(d))}`;
  return `${sign}${Math.abs((d / earlier) * 100).toFixed(0)}%`;
}

/** A small line of the rolling average, scaled to its own range. */
function Sparkline({ series, up }: { series: number[]; up: boolean }) {
  const w = 96;
  const h = 24;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const pts = series
    .map(
      (v, i) =>
        `${(i / Math.max(1, series.length - 1)) * w},${h - 2 - ((v - lo) / span) * (h - 4)}`,
    )
    .join(" ");
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      className="h-6 w-24 shrink-0"
      preserveAspectRatio="none"
    >
      <polyline
        points={pts}
        fill="none"
        strokeWidth={1.75}
        vectorEffect="non-scaling-stroke"
        className={up ? "stroke-win" : "stroke-loss"}
      />
    </svg>
  );
}

/** Your latest games on the hero against the ones before, stat by stat. */
export function ProgressCard({
  progress,
  heroLabel,
}: {
  progress: HeroProgress;
  heroLabel: string;
}) {
  return (
    <MetaSection
      id="hero-progress"
      kicker="Progress"
      title={`Are you getting better on ${heroLabel}?`}
      description={`Your last ${progress.half} games against the ${progress.half} before them (from your ${progress.games} most recent on ${heroLabel}). Lines are 5-game rolling averages.`}
      footer="Per-minute stats move with role and game length, so a change can come from playing a different position."
    >
      <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {progress.stats.map((s) => {
          const better = s.change >= 0;
          return (
            <li key={s.stat} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 text-sm">{LABEL[s.stat]}</span>
              <Sparkline series={s.series} up={better} />
              <span className="w-28 shrink-0 text-right text-sm tabular-nums">
                <span className="text-muted-foreground">{show(s.stat, s.earlier)} → </span>
                <span className="font-medium">{show(s.stat, s.latest)}</span>
              </span>
              <span
                className={cn(
                  "w-16 shrink-0 text-right text-xs font-semibold tabular-nums",
                  s.change > 0 ? "text-win" : s.change < 0 ? "text-loss" : "text-muted-foreground",
                )}
              >
                {change(s.stat, s.earlier, s.latest)}
              </span>
            </li>
          );
        })}
      </ul>
    </MetaSection>
  );
}
