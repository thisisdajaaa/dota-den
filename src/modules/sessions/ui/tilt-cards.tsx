"use client";

import Link from "next/link";
import { Coffee, TrendingDown } from "lucide-react";
import { useT } from "@/common/i18n/client";
import { formatPercent } from "@/modules/matches/ui/format";
import { MIN_TILT_GAMES, type TiltStats, type TiltWarning } from "../domain/tilt";

/** Dashboard: only while on a losing streak that the player's own history says to respect. */
export function TiltWarningCard({ warning }: { warning: TiltWarning }) {
  const t = useT();
  const { streak, after, baseline } = warning;
  const k = streak >= 3 ? 3 : 2;
  // The rate is highlighted, so the sentence is split around its placeholder.
  const [before, rest = ""] = t("sessions.tilt.body", {
    k,
    games: after.games,
    baseline: formatPercent(baseline.rate),
  }).split("{rate}");
  return (
    <section
      aria-label={t("sessions.tilt.region")}
      className="panel flex items-start gap-3 border-gold/30 bg-gold/[0.04] p-4"
    >
      <Coffee aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="space-y-1 text-sm">
        <p className="font-medium">{t("sessions.tilt.streak", { n: streak })}</p>
        <p className="text-muted-foreground">
          {before}
          <span className="font-medium text-foreground">{formatPercent(after.rate)}</span>
          {rest}{" "}
          <Link href="/sessions" className="text-gold hover:underline">
            {t("sessions.tilt.yourSessions")}
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Sessions page: the player's win rate after losing streaks, with sample sizes. */
export function AfterLossesPanel({ stats }: { stats: TiltStats }) {
  const t = useT();
  const { baseline, afterLosses } = stats;
  const row = (label: string, r: { games: number; rate: number }) => (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        {r.games >= MIN_TILT_GAMES ? formatPercent(r.rate) : "—"}
      </p>
      <p className="text-xs text-muted-foreground">
        {r.games >= MIN_TILT_GAMES
          ? t("sessions.tilt.games", { n: r.games.toLocaleString("en-US") })
          : t("sessions.tilt.tooFew", { n: r.games })}
      </p>
    </div>
  );
  return (
    <section className="panel space-y-3 p-5" aria-labelledby="after-losses">
      <div className="flex items-center gap-2">
        <TrendingDown aria-hidden className="size-4 text-gold" />
        <h2 id="after-losses" className="text-lg font-semibold">
          {t("sessions.tilt.title")}
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">{t("sessions.tilt.intro")}</p>
      <div className="grid grid-cols-3 gap-4">
        {row(t("sessions.tilt.overall"), baseline)}
        {row(t("sessions.tilt.after2"), afterLosses[2])}
        {row(t("sessions.tilt.after3"), afterLosses[3])}
      </div>
    </section>
  );
}
