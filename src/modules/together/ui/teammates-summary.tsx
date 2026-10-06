import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, plural } from "@/modules/matches/ui/format";
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
export function TeammatesSummary({ data }: { data: TeammatesOverview }) {
  const { best, mostPlayed, rivals, queueMix } = data;
  const rival = rivals[0];
  return (
    <section
      aria-label="Teammate highlights"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Tile
        label="Best teammate"
        detail={
          best
            ? `${formatPercent(best.teammate.winRate)} in ${plural(best.teammate.withGames, "game")} on your team. Ranked after pulling each rate toward your usual ${formatPercent(best.baselineRate)} (as if ${SHRINK_GAMES} extra average games), so short lucky runs don't win.`
            : `Needs a teammate with ${MIN_TEAMMATE_GAMES}+ games on your team and your overall record.`
        }
      >
        {best ? nameLink(best.teammate) : "Not enough games yet"}
      </Tile>
      <Tile
        label="Most played with"
        detail={
          mostPlayed
            ? `${plural(mostPlayed.withGames, "game")} on your team · ${formatPercent(mostPlayed.winRate)} win rate`
            : "Nobody yet"
        }
      >
        {mostPlayed ? nameLink(mostPlayed) : "—"}
      </Tile>
      <Tile
        label={`Your last ${plural(queueMix.games || RECENT_QUEUE_GAMES, "game")}`}
        detail={
          queueMix.games > 0
            ? `${queueMix.solo} solo · ${queueMix.unknown} unknown (no party data, never assumed solo)`
            : "Import your matches to see how often you queue with others."
        }
      >
        {queueMix.games > 0 ? `${queueMix.party} in a party` : "No games imported"}
      </Tile>
      <Tile
        label="Rival"
        detail={
          rival
            ? `Faced ${plural(rival.againstGames, "time")} · you won ${rival.againstWins}${rival.withGames > 0 ? ` · ${plural(rival.withGames, "game")} as teammates` : " · never a teammate"}`
            : `Nobody you've faced ${MIN_RIVAL_GAMES}+ times and more often than you've teamed with.`
        }
      >
        {rival ? (
          <Link href={`/players/${rival.accountId32}`} className="hover:text-gold">
            {displayName(rival.personaName, rival.accountId32)}
          </Link>
        ) : (
          "No rivals yet"
        )}
      </Tile>
    </section>
  );
}

export function TeammatesSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading teammates">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
