import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import type { Translator } from "@/common/i18n/translate";
import type { StandingView } from "../dtos/responses/leaderboard-views.dto";
import { leaderboardHref } from "./copy";

function Heading({ t }: { t: Translator<Messages> }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="kicker">{t("leaderboards.standing.kicker")}</p>
        <h2 className="text-lg font-semibold">{t("leaderboards.standing.title")}</h2>
      </div>
      <Trophy aria-hidden className="size-5 text-gold" />
    </div>
  );
}

/** The overview's small "Your standing" card: your all-time rank on each friends board. */
export async function StandingCard({ standings }: { standings: StandingView[] }) {
  const t = await getT();
  return (
    <section aria-label={t("leaderboards.standing.label")} className="panel space-y-3 p-5">
      <Heading t={t} />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {standings.map((s) => {
          return (
            <li key={s.kind}>
              <Link
                href={leaderboardHref({ board: s.kind, scope: "friends", period: "all" })}
                className="group flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
              >
                <span className="font-display text-2xl font-bold text-gold tabular-nums">
                  {s.rank === null ? "—" : `#${s.rank}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-gold">
                    {t(`leaderboards.boards.${s.kind}`)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {s.rank === null
                      ? t("leaderboards.standing.notPlayed")
                      : `${t(`leaderboards.units.${s.kind}.${s.value === 1 ? "one" : "other"}`, { n: s.value })} · ${t(`leaderboards.units.player.${s.players === 1 ? "one" : "other"}`, { n: s.players })}`}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground group-hover:text-gold"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export async function StandingUnavailable() {
  const t = await getT();
  return (
    <section aria-label={t("leaderboards.standing.label")} className="panel space-y-2 p-5">
      <Heading t={t} />
      <p role="alert" className="text-sm text-muted-foreground">
        {t("leaderboards.standing.unavailable")}
      </p>
    </section>
  );
}

export async function StandingSkeleton() {
  const t = await getT();
  return <Skeleton className="h-32 rounded-2xl" aria-label={t("leaderboards.standing.loading")} />;
}
