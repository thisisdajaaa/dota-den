import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  EyeOff,
  LayoutDashboard,
  LogIn,
} from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { formatPercent } from "@/modules/matches/ui/format";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { PlayerBanner } from "@/modules/matches/ui/player-banner";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { parseAccountId } from "@/modules/players/domain/player-lookup";
import {
  topHeroes,
  topTeammates,
  totalGames,
  winRate,
} from "@/modules/players/domain/public-player";
import { MostPlayedHeroesCard } from "@/modules/players/ui/most-played-heroes-card";
import { displayName } from "@/modules/players/ui/player-avatar";
import { PlaysWithCard } from "@/modules/players/ui/plays-with-card";
import { TrackButton } from "@/modules/players/ui/track-button";
import { followService, ownerOf, playersService } from "@/modules/players";

type What = keyof Messages["players"]["profile"]["what"];

function upstreamErrorCopy(t: Translator<Messages>, error: { type: string }, what: What): string {
  const thing = t(`players.profile.what.${what}`);
  return error.type === "rate_limited"
    ? t("players.profile.upstreamBusy", { what: thing })
    : t("players.profile.upstreamError", { what: thing });
}

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

  const [view, heroes, viewer, t] = await Promise.all([
    playersService.publicPlayer(accountId32),
    matchesService.heroMap(),
    getCurrentUser({ tolerateErrors: true }),
    getT(),
  ]);
  if (!view.profile.ok && view.profile.error.type === "not_found") notFound();

  const isSelf = viewer?.accountId32 === accountId32;
  const tracked =
    viewer && !isSelf
      ? await followService.isFollowing(ownerOf(viewer), accountId32).catch(() => false)
      : false;

  const profile = view.profile.ok ? view.profile.value : null;
  const name = displayName(profile?.personaName ?? null, accountId32);
  const now = new Date();

  const record = view.record.ok ? view.record.value : null;
  const games = record ? totalGames(record) : 0;
  const rate = record ? winRate(record.wins, games) : null;
  const heroUsage = view.heroes.ok ? topHeroes(view.heroes.value, 8) : [];
  const teammates = view.peers.ok ? topTeammates(view.peers.value, 10) : [];
  const matches = view.matches.ok ? view.matches.value : [];
  const favourite = heroUsage[0];
  const limited =
    profile?.matchHistory === "limited" ||
    (record !== null && games === 0 && view.matches.ok && matches.length === 0);

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

      {!view.profile.ok && (
        <p role="alert" className="panel flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
          {upstreamErrorCopy(t, view.profile.error, "nameRank")}
        </p>
      )}

      {limited && (
        <section
          className="panel flex items-start gap-3 p-5 text-sm"
          aria-labelledby="limited-history"
        >
          <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
          <div className="space-y-1">
            <h2 id="limited-history" className="font-semibold">
              {t("players.profile.limitedTitle")}
            </h2>
            <p className="text-muted-foreground">{t("players.profile.limitedBody")}</p>
          </div>
        </section>
      )}

      <section
        aria-label={t("players.profile.recordLabel")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {record ? (
          <>
            <StatTile
              label={t("players.profile.winRate")}
              value={formatPercent(rate)}
              meter={rate}
              tone={rate !== null && rate >= 0.5 ? "win" : "loss"}
              detail={`${plural(t, "players.units.win", record.wins)} · ${plural(t, "players.units.loss", record.losses)}`}
            />
            <StatTile
              label={t("players.profile.gamesPlayed")}
              value={games.toLocaleString("en-US")}
              detail={t("players.profile.allPublic")}
            />
          </>
        ) : (
          <p
            role="alert"
            className="panel flex items-center p-4 text-sm text-muted-foreground sm:col-span-2"
          >
            {upstreamErrorCopy(
              t,
              view.record.ok ? { type: "unavailable" } : view.record.error,
              "record",
            )}
          </p>
        )}
        <StatTile
          label={t("players.profile.mostPlayedHero")}
          value={favourite ? heroName(heroes.get(favourite.heroId), favourite.heroId) : "—"}
          detail={
            favourite
              ? t("players.profile.heroDetail", {
                  games: plural(t, "players.units.game", favourite.games),
                  rate: formatPercent(winRate(favourite.wins, favourite.games)),
                })
              : t("players.profile.noHeroStats")
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PlaysWithCard
            peers={teammates}
            now={now}
            error={view.peers.ok ? null : upstreamErrorCopy(t, view.peers.error, "teammates")}
          />
        </div>
        <div className="lg:col-span-2">
          <MostPlayedHeroesCard
            heroes={heroUsage}
            catalog={heroes}
            error={view.heroes.ok ? null : upstreamErrorCopy(t, view.heroes.error, "heroStats")}
          />
        </div>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="recent-matches">
        <div className="p-5 pb-3">
          <p className="kicker">{t("players.profile.matchesKicker")}</p>
          <h2 id="recent-matches" className="text-lg font-semibold">
            {t("players.profile.matchesTitle")}
          </h2>
        </div>
        {!view.matches.ok ? (
          <p
            role="alert"
            className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground"
          >
            {upstreamErrorCopy(t, view.matches.error, "recentMatches")}
          </p>
        ) : matches.length === 0 ? (
          <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
            {t("players.profile.noMatches")}
          </p>
        ) : (
          <MatchRows matches={matches} heroes={heroes} now={now} />
        )}
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
