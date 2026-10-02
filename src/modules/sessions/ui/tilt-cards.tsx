import Link from "next/link";
import { Coffee, TrendingDown } from "lucide-react";
import { formatPercent } from "@/modules/matches/ui/format";
import { MIN_TILT_GAMES, type TiltStats, type TiltWarning } from "../domain/tilt";

/** Dashboard: only while on a losing streak that the player's own history says to respect. */
export function TiltWarningCard({ warning }: { warning: TiltWarning }) {
  const { streak, after, baseline } = warning;
  const k = streak >= 3 ? 3 : 2;
  return (
    <section
      aria-label="Tilt check"
      className="panel flex items-start gap-3 border-gold/30 bg-gold/[0.04] p-4"
    >
      <Coffee aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">{streak} losses in a row. Maybe take a short break?</p>
        <p className="text-muted-foreground">
          After {k} straight losses in a session you&apos;ve won{" "}
          <span className="font-medium text-foreground">{formatPercent(after.rate)}</span> of{" "}
          {after.games} ranked games, against {formatPercent(baseline.rate)} overall.{" "}
          <Link href="/sessions" className="text-gold hover:underline">
            Your sessions
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Sessions page: the player's win rate after losing streaks, with sample sizes. */
export function AfterLossesPanel({ stats }: { stats: TiltStats }) {
  const { baseline, afterLosses } = stats;
  const row = (label: string, r: { games: number; rate: number }) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        {r.games >= MIN_TILT_GAMES ? formatPercent(r.rate) : "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        {r.games >= MIN_TILT_GAMES
          ? `${r.games.toLocaleString("en-US")} games`
          : `${r.games} games, too few to say`}
      </p>
    </div>
  );
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="after-losses">
      <div className="flex items-center gap-2">
        <TrendingDown aria-hidden className="size-4 text-gold" />
        <h2 id="after-losses" className="text-lg font-semibold">
          After losses
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Your ranked win rate in games played right after losing streaks, within the same session. If
        it drops, the overview will suggest a break when you&apos;re on one.
      </p>
      <div className="grid grid-cols-3 gap-4">
        {row("Overall", baseline)}
        {row("After 2 losses in a row", afterLosses[2])}
        {row("After 3 in a row", afterLosses[3])}
      </div>
    </section>
  );
}
