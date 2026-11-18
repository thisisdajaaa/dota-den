import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";
import type { PlaySession } from "../domain/session";
import { formatSpan, sessionTimeLabels } from "../domain/session-labels";
import type { SessionMmr } from "../domain/session-mmr";
import type { StopLossStatus } from "../domain/stop-loss";
import { MmrChangeBadge } from "./mmr-change-badge";
import { SessionRecord } from "./session-list";

/** Dashboard teaser for the most recent play session. */
export async function LatestSessionCard({
  session,
  mmr,
  heroes,
  timeZone,
  stopLoss = null,
}: {
  session: PlaySession;
  mmr: SessionMmr;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
  /** The player's stop-loss against this session (`status` null: not set). Null: unknown. */
  stopLoss?: { status: StopLossStatus | null; current: boolean } | null;
}) {
  const t = await getT();
  const labels = sessionTimeLabels(session.startedAt, session.endedAt, timeZone);
  const s = session.stats;
  return (
    <section className="panel p-5" aria-labelledby="latest-session-kicker latest-session-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p id="latest-session-kicker" className="kicker">
            {t("sessions.latest.kicker")}
          </p>
          <h2 id="latest-session-title" className="text-lg font-semibold">
            {labels.date}
          </h2>
          <p className="text-xs text-muted-foreground">
            {labels.timeRange} · {formatSpan(s.spanSec)} ·{" "}
            {plural(t, "sessions.item.games", s.games)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SessionRecord wins={s.wins} losses={s.losses} className="text-lg" />
          <MmrChangeBadge mmr={mmr} />
          <span className="flex gap-1" aria-hidden>
            {s.heroes.slice(0, 3).map((h) => (
              <HeroPortrait
                key={h.heroId}
                hero={heroes.get(h.heroId)}
                heroId={h.heroId}
                size="xs"
              />
            ))}
          </span>
          <Link
            href={`/sessions/${session.id}`}
            className="relative inline-flex items-center gap-1 text-sm font-medium text-gold hover:underline touch:tap-area"
          >
            {t("sessions.latest.openRecap")} <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
      {stopLoss && <StopLossLine {...stopLoss} />}
    </section>
  );
}

/** "Stop-loss: 1 of 2 losses used" under the record, or an invitation to set one. */
async function StopLossLine({
  status,
  current,
}: {
  status: StopLossStatus | null;
  current: boolean;
}) {
  const t = await getT();
  const link = (label: string) => (
    <Link
      href="/account#stop-loss"
      className="relative text-xs font-medium text-gold hover:underline touch:tap-area"
    >
      {label}
    </Link>
  );
  if (!status) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden className="size-4 text-muted-foreground" />
        {t("sessions.stopLoss.status.invite")} {link(t("sessions.stopLoss.status.setUp"))}
      </p>
    );
  }
  const reached = status.reached.length > 0;
  const outcome = reached
    ? current
      ? t("sessions.stopLoss.status.reached")
      : t("sessions.stopLoss.status.reachedPast")
    : current
      ? null
      : t("sessions.stopLoss.status.fresh");
  return (
    <div
      role="status"
      aria-label={t("sessions.stopLoss.status.region")}
      data-testid="stop-loss-status"
      className={
        reached && current
          ? "mt-3 space-y-1 rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm"
          : "mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-sm"
      }
    >
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 font-medium">
          <ShieldCheck aria-hidden className={reached ? "size-4 text-loss" : "size-4 text-gold"} />
          {t("sessions.stopLoss.status.region")}
        </span>
        {status.rules.map((r) => (
          <span
            key={r.rule}
            className={r.reached ? "font-medium text-loss tabular-nums" : "tabular-nums"}
          >
            {plural(t, `sessions.stopLoss.status.${r.rule}`, r.limit, { used: r.used })}
          </span>
        ))}
        {link(t("sessions.stopLoss.status.edit"))}
      </p>
      {outcome && (
        <p className={reached && current ? "font-medium" : "text-xs text-muted-foreground"}>
          {outcome}
        </p>
      )}
    </div>
  );
}
