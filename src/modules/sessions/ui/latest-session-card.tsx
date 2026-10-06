import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait } from "@/modules/matches/ui/hero-portrait";
import type { PlaySession } from "../domain/session";
import { formatSpan, sessionTimeLabels } from "../domain/session-labels";
import type { SessionMmr } from "../domain/session-mmr";
import { MmrChangeBadge } from "./mmr-change-badge";
import { SessionRecord } from "./session-list";

/** Dashboard teaser for the most recent play session. */
export async function LatestSessionCard({
  session,
  mmr,
  heroes,
  timeZone,
}: {
  session: PlaySession;
  mmr: SessionMmr;
  heroes: Map<number, HeroInfo>;
  timeZone: string;
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
            className="inline-flex items-center gap-1 text-sm font-medium text-gold hover:underline"
          >
            {t("sessions.latest.openRecap")} <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
