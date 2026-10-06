import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatPercent } from "@/modules/matches/ui/format";
import { displayName } from "@/modules/players/ui/player-avatar";
import type { TeammatesOverview } from "../dtos/responses/together-views.dto";
import {
  MIN_RIVAL_GAMES,
  MIN_TEAMMATE_GAMES,
  RECENT_QUEUE_GAMES,
  SHRINK_GAMES,
} from "../domain/teammates";

function Tile({
  label,
  children,
  detail,
}: {
  label: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="panel flex min-w-0 flex-col gap-1 p-4">
      <span className="kicker">{label}</span>
      <span className="truncate text-xl font-semibold tracking-tight">{children}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}

const nameLink = (t: { accountId32: number; personaName: string | null }) => (
  <Link href={`/together/${t.accountId32}`} className="hover:text-gold">
    {displayName(t.personaName, t.accountId32)}
  </Link>
);

/** Headline tiles for the overview's Teammates section. */
export async function TeammatesSummary({ data }: { data: TeammatesOverview }) {
  const t = await getT();
  const { best, mostPlayed, rivals, queueMix } = data;
  const rival = rivals[0];
  return (
    <section
      aria-label={t("together.summary.label")}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Tile
        label={t("together.summary.best")}
        detail={
          best
            ? t("together.summary.bestDetail", {
                rate: formatPercent(best.teammate.winRate),
                games: plural(t, "together.units.game", best.teammate.withGames),
                usual: formatPercent(best.baselineRate),
                shrink: SHRINK_GAMES,
              })
            : t("together.summary.bestNeeds", { min: MIN_TEAMMATE_GAMES })
        }
      >
        {best ? nameLink(best.teammate) : t("together.summary.notEnough")}
      </Tile>
      <Tile
        label={t("together.summary.mostPlayed")}
        detail={
          mostPlayed
            ? t("together.summary.mostPlayedDetail", {
                games: plural(t, "together.units.game", mostPlayed.withGames),
                rate: formatPercent(mostPlayed.winRate),
              })
            : t("together.summary.nobody")
        }
      >
        {mostPlayed ? nameLink(mostPlayed) : "—"}
      </Tile>
      <Tile
        label={t("together.summary.lastGames", {
          games: plural(t, "together.units.game", queueMix.games || RECENT_QUEUE_GAMES),
        })}
        detail={
          queueMix.games > 0
            ? t("together.summary.queueDetail", { solo: queueMix.solo, unknown: queueMix.unknown })
            : t("together.summary.importHint")
        }
      >
        {queueMix.games > 0
          ? t("together.summary.inParty", { n: queueMix.party })
          : t("together.summary.noGames")}
      </Tile>
      <Tile
        label={t("together.summary.rival")}
        detail={
          rival
            ? `${t("together.summary.rivalFaced", {
                times: plural(t, "together.units.time", rival.againstGames),
                wins: rival.againstWins,
              })} · ${
                rival.withGames > 0
                  ? t("together.summary.rivalTeammates", {
                      games: plural(t, "together.units.game", rival.withGames),
                    })
                  : t("together.summary.rivalNever")
              }`
            : t("together.summary.rivalNone", { min: MIN_RIVAL_GAMES })
        }
      >
        {rival ? (
          <Link href={`/players/${rival.accountId32}`} className="hover:text-gold">
            {displayName(rival.personaName, rival.accountId32)}
          </Link>
        ) : (
          t("together.summary.noRivals")
        )}
      </Tile>
    </section>
  );
}

export async function TeammatesSkeleton() {
  const t = await getT();
  return (
    <div className="space-y-3" aria-busy aria-label={t("together.summary.loading")}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
