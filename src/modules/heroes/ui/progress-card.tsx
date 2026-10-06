import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { HeroProgress, ProgressStat } from "../domain/hero-progress";
import { MetaSection } from "@/modules/meta/ui/meta-section";

function show(stat: ProgressStat, v: number): string {
  if (stat === "winRate") return `${(v * 100).toFixed(0)}%`;
  if (stat === "lhpm" || stat === "kda") return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}

function change(
  stat: ProgressStat,
  earlier: number,
  latest: number,
  t: Translator<Messages>,
): string {
  const d = latest - earlier;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  if (stat === "winRate")
    return t("heroes.progress.points", { v: `${sign}${Math.abs(d * 100).toFixed(0)}` });
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
export async function ProgressCard({
  progress,
  heroLabel,
}: {
  progress: HeroProgress;
  heroLabel: string;
}) {
  const t = await getT();
  return (
    <MetaSection
      id="hero-progress"
      kicker={t("heroes.progress.kicker")}
      title={t("heroes.progress.title", { hero: heroLabel })}
      description={t("heroes.progress.description", {
        half: progress.half,
        games: progress.games,
        hero: heroLabel,
      })}
      footer={t("heroes.progress.footer")}
    >
      <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {progress.stats.map((s) => {
          const better = s.change >= 0;
          return (
            <li key={s.stat} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 text-sm">{t(`heroes.progress.stats.${s.stat}`)}</span>
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
                {change(s.stat, s.earlier, s.latest, t)}
              </span>
            </li>
          );
        })}
      </ul>
    </MetaSection>
  );
}
