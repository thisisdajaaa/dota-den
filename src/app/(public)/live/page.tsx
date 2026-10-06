import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { liveService } from "@/modules/live";
import { AutoRefresh } from "@/modules/live/ui/auto-refresh";
import { LiveGameCard } from "@/modules/live/ui/live-game-card";
import { matchesService } from "@/modules/matches";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("live.title") };
}

export default async function LivePage() {
  const [overview, heroes, t] = await Promise.all([
    liveService.overview(),
    matchesService.heroMap(),
    getT(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("live.kicker")}
        title={t("live.title")}
        description={t("live.description")}
      />
      <AutoRefresh seconds={30} />
      {!overview ? (
        <section
          role="alert"
          className="panel grid place-items-center gap-3 px-6 py-16 text-center"
        >
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <p className="text-sm text-muted-foreground">{t("live.unavailable")}</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="live-league" className="space-y-3">
            <h2 id="live-league" className="text-lg font-semibold">
              {t("live.league")}
            </h2>
            {overview.league.length === 0 ? (
              <p className="panel p-5 text-sm text-muted-foreground">{t("live.noLeague")}</p>
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
              {t("live.topPublic")}
            </h2>
            {overview.topPublic.length === 0 ? (
              <p className="panel p-5 text-sm text-muted-foreground">{t("live.noPublic")}</p>
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
