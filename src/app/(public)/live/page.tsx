import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertTriangle, Swords } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { logger } from "@/common/logging/logger";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import {
  LIVE_CACHE_SECONDS,
  liveService,
  streamerFollowService,
  streamerOwnerOf,
} from "@/modules/live";
import type { FollowedChannel } from "@/modules/live/domain/streams";
import { AutoRefresh } from "@/modules/live/ui/auto-refresh";
import { HubSkeleton } from "@/modules/live/ui/hub-skeleton";
import { LiveGameCard } from "@/modules/live/ui/live-game-card";
import { WatchHub } from "@/modules/live/ui/watch-hub";
import { matchesService } from "@/modules/matches";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("live.title"),
    description: t("live.description"),
    alternates: { canonical: "/live" },
  };
}

export default async function LivePage() {
  const t = await getT();
  return (
    <div className="space-y-8">
      <PageHeader
        kicker={t("live.kicker")}
        title={t("live.title")}
        description={t("live.description")}
      />
      {/* Refreshes the data below; the player and its chat keep playing (see WatchHub). */}
      <AutoRefresh seconds={LIVE_CACHE_SECONDS} />
      <Suspense fallback={<HubSkeleton label={t("live.hub.loading")} />}>
        <Hub />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label={t("live.games.title")} rows={3} />}>
        <LiveGames />
      </Suspense>
    </div>
  );
}

/** Streams, followed channels and search: Twitch can be slow, so this streams in. */
async function Hub() {
  const viewer = await getCurrentUser({ tolerateErrors: true });
  const [data, following] = await Promise.all([
    liveService.hub(),
    viewer
      ? streamerFollowService
          .following(streamerOwnerOf(viewer))
          .catch((e: unknown): FollowedChannel[] | "error" => {
            logger.error("streamer_follows_failed", { error: e });
            return "error";
          })
      : null,
  ]);
  return (
    <WatchHub
      data={data}
      platforms={liveService.platforms}
      signedIn={!!viewer}
      following={following === "error" ? [] : following}
      followingFailed={following === "error"}
    />
  );
}

/** Pro and high-MMR games from the game's spectator feed. */
async function LiveGames() {
  const [overview, heroes, t] = await Promise.all([
    liveService.overview(),
    matchesService.heroMap(),
    getT(),
  ]);
  return (
    <section aria-labelledby="live-games" className="space-y-5">
      <div>
        <h2 id="live-games" className="flex items-center gap-2 text-lg font-semibold">
          <Swords aria-hidden className="size-5 text-gold" /> {t("live.games.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("live.games.subtitle")}</p>
      </div>
      {!overview ? (
        <div role="alert" className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <AlertTriangle aria-hidden className="size-8 text-gold" />
          <p className="text-sm text-muted-foreground">{t("live.unavailable")}</p>
        </div>
      ) : (
        <>
          {!overview.streamsKnown ? (
            <p className="panel p-5 text-sm text-muted-foreground">
              {t("live.games.streamsUnknown")}
            </p>
          ) : overview.league.length + overview.topPublic.length === 0 ? (
            <p className="panel p-5 text-sm text-muted-foreground">{t("live.games.none")}</p>
          ) : null}
          {overview.league.length > 0 && (
            <section aria-labelledby="live-league" className="space-y-3">
              <h3 id="live-league" className="font-semibold">
                {t("live.league")}
              </h3>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {overview.league.map((g) => (
                  <LiveGameCard key={g.matchId} game={g} heroes={heroes} />
                ))}
              </ul>
            </section>
          )}
          {overview.topPublic.length > 0 && (
            <section aria-labelledby="live-public" className="space-y-3">
              <h3 id="live-public" className="font-semibold">
                {t("live.topPublic")}
              </h3>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {overview.topPublic.map((g) => (
                  <LiveGameCard key={g.matchId} game={g} heroes={heroes} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
