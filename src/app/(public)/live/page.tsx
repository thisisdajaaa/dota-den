import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { liveService } from "@/modules/live";
import { AutoRefresh } from "@/modules/live/ui/auto-refresh";
import { LiveGameCard } from "@/modules/live/ui/live-game-card";
import { matchesService } from "@/modules/matches";

export const metadata: Metadata = { title: "Live games" };

export default async function LivePage() {
  const [overview, heroes] = await Promise.all([liveService.overview(), matchesService.heroMap()]);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Live"
        title="Live games"
        description="League and pro games happening now, from the game's spectator feed (league games run about 15 minutes behind), and the highest-MMR public games. Open a game for a live read of its draft. Refreshes every 30 seconds."
      />
      <AutoRefresh seconds={30} />
      {!overview ? (
        <section
          role="alert"
          className="panel grid place-items-center gap-3 px-6 py-16 text-center"
        >
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <p className="text-sm text-muted-foreground">
            The live feed is unavailable right now. Try again in a minute.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="live-league" className="space-y-3">
            <h2 id="live-league" className="text-lg font-semibold">
              League games
            </h2>
            {overview.league.length === 0 ? (
              <p className="panel p-5 text-sm text-muted-foreground">
                No league games are live right now.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {overview.league.map((g) => (
                  <LiveGameCard key={g.matchId} game={g} heroes={heroes} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="live-public" className="space-y-3">
            <h2 id="live-public" className="text-lg font-semibold">
              Highest-MMR public games
            </h2>
            {overview.topPublic.length === 0 ? (
              <p className="panel p-5 text-sm text-muted-foreground">None reported right now.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {overview.topPublic.map((g) => (
                  <LiveGameCard key={g.matchId} game={g} heroes={heroes} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
