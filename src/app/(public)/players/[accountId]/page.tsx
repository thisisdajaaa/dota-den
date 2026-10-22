import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, ArrowLeftRight, LayoutDashboard, LogIn } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import { logger } from "@/common/logging/logger";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { PlayerBanner } from "@/modules/matches/ui/player-banner";
import { parseAccountId } from "@/modules/players/domain/player-lookup";
import { displayName } from "@/modules/players/ui/player-avatar";
import { TrackButton } from "@/modules/players/ui/track-button";
import { followService, ownerOf, playersService } from "@/modules/players";
import {
  FavouriteHeroTile,
  LimitedHistory,
  LimitedHistoryIfEmpty,
  MatchRowsSkeleton,
  MostPlayedHeroes,
  PlaysWith,
  RecentMatches,
  RecordTiles,
  upstreamErrorCopy,
} from "./sections";

export async function generateMetadata({
  params,
}: PageProps<"/players/[accountId]">): Promise<Metadata> {
  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) return { title: (await getT())("players.notFound.title") };
  const profile = await matchesService.playerProfile(accountId32);
  return { title: displayName(profile?.personaName ?? null, accountId32) };
}

export default async function PlayerPage({ params }: PageProps<"/players/[accountId]">) {
  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) notFound();

  // Every section starts now, but only the header (profile) holds the page: the cards
  // stream in on their own, so one slow OpenDota call doesn't keep the whole page blank.
  const sections = playersService.publicPlayerSections(accountId32);
  const catalog = matchesService.heroMap().catch((e: unknown): Map<number, HeroInfo> => {
    logger.warn("player_hero_catalog_failed", { error: e });
    return new Map();
  });
  const [profileRes, viewer, t] = await Promise.all([
    sections.profile,
    getCurrentUser({ tolerateErrors: true }),
    getT(),
  ]);
  if (!profileRes.ok && profileRes.error.type === "not_found") notFound();

  const isSelf = viewer?.accountId32 === accountId32;
  const tracked =
    viewer && !isSelf
      ? await followService.isFollowing(ownerOf(viewer), accountId32).catch(() => false)
      : false;

  const profile = profileRes.ok ? profileRes.value : null;
  const name = displayName(profile?.personaName ?? null, accountId32);
  const now = new Date();

  return (
    <div className="space-y-6">
      <Link
        href="/players"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("players.profile.back")}
      </Link>

      <PlayerBanner
        profile={profile}
        accountId32={accountId32}
        kicker={t("players.profile.kicker")}
      >
        {isSelf ? (
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gold/15 px-3.5 text-sm font-medium text-gold ring-1 ring-gold/30 hover:bg-gold/10"
          >
            <LayoutDashboard aria-hidden className="size-4" />
            {t("players.profile.isYou")}
          </Link>
        ) : viewer ? (
          <TrackButton accountId32={accountId32} name={name} tracked={tracked} />
        ) : (
          <a
            href="/api/v1/auth/steam/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
          >
            <LogIn aria-hidden className="size-4" />
            {t("players.profile.signInToTrack")}
          </a>
        )}
        {!isSelf && (
          <Link
            href={
              viewer
                ? `/players/compare?a=${viewer.accountId32}&b=${accountId32}`
                : `/players/compare?b=${accountId32}`
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
          >
            <ArrowLeftRight aria-hidden className="size-4" />
            {viewer ? t("players.profile.compareWithYou") : t("players.profile.compare")}
          </Link>
        )}
      </PlayerBanner>

      {!profileRes.ok && (
        <p role="alert" className="panel flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
          {upstreamErrorCopy(t, profileRes.error, "nameRank")}
        </p>
      )}

      {profile?.matchHistory === "limited" ? (
        <LimitedHistory t={t} />
      ) : (
        <Suspense fallback={null}>
          <LimitedHistoryIfEmpty record={sections.record} matches={sections.matches} />
        </Suspense>
      )}

      <section
        aria-label={t("players.profile.recordLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <Suspense
          fallback={
            <>
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </>
          }
        >
          <RecordTiles record={sections.record} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-28 rounded-2xl" />}>
          <FavouriteHeroTile heroes={sections.heroes} catalog={catalog} />
        </Suspense>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
            <PlaysWith peers={sections.peers} now={now} />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
            <MostPlayedHeroes heroes={sections.heroes} catalog={catalog} />
          </Suspense>
        </div>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="recent-matches">
        <div className="p-5 pb-3">
          <p className="kicker">{t("players.profile.matchesKicker")}</p>
          <h2 id="recent-matches" className="text-lg font-semibold">
            {t("players.profile.matchesTitle")}
          </h2>
        </div>
        <Suspense fallback={<MatchRowsSkeleton />}>
          <RecentMatches matches={sections.matches} catalog={catalog} now={now} />
        </Suspense>
      </section>

      <p className="text-xs text-muted-foreground">
        {t("players.profile.dataFrom")}{" "}
        <a
          href={`https://www.opendota.com/players/${accountId32}`}
          target="_blank"
          rel="noreferrer"
          className="text-gold hover:underline"
        >
          OpenDota
        </a>
        {t("players.profile.dataAfter")}
      </p>
    </div>
  );
}
