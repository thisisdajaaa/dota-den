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
import { getCurrentUser } from "@/modules/identity";
import { getHeroMap, getPlayerProfile } from "@/modules/matches/composition";
import { formatPercent, plural } from "@/modules/matches/ui/format";
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

function upstreamErrorCopy(error: { type: string }, what: string): string {
  return error.type === "rate_limited"
    ? `OpenDota is busy right now, so we couldn't load ${what}. Try again in a minute.`
    : `Couldn't load ${what} from OpenDota right now. Try again shortly.`;
}

export async function generateMetadata({
  params,
}: PageProps<"/players/[accountId]">): Promise<Metadata> {
  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) return { title: "Player not found" };
  const profile = await getPlayerProfile(accountId32);
  return { title: displayName(profile?.personaName ?? null, accountId32) };
}

export default async function PlayerPage({ params }: PageProps<"/players/[accountId]">) {
  const accountId32 = parseAccountId((await params).accountId);
  if (accountId32 === null) notFound();

  const [view, heroes, viewer] = await Promise.all([
    playersService.publicPlayer(accountId32),
    getHeroMap(),
    getCurrentUser({ tolerateErrors: true }),
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
        All players
      </Link>

      <PlayerBanner profile={profile} accountId32={accountId32} kicker="Player profile">
        {isSelf ? (
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gold/15 px-3.5 text-sm font-medium text-gold ring-1 ring-gold/30 hover:bg-gold/10"
          >
            <LayoutDashboard aria-hidden className="size-4" />
            This is you: open your dashboard
          </Link>
        ) : viewer ? (
          <TrackButton accountId32={accountId32} name={name} tracked={tracked} />
        ) : (
          <a
            href="/api/v1/auth/steam/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-muted-foreground ring-1 ring-white/10 hover:text-foreground"
          >
            <LogIn aria-hidden className="size-4" />
            Sign in to track
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
            {viewer ? "Compare with you" : "Compare"}
          </Link>
        )}
      </PlayerBanner>

      {!view.profile.ok && (
        <p role="alert" className="panel flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-loss" />
          {upstreamErrorCopy(view.profile.error, "this player's name and rank")}
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
              Match history is private or limited
            </h2>
            <p className="text-muted-foreground">
              OpenDota can only see this player&apos;s games once they turn on “Expose Public Match
              Data” in Dota 2 (Settings → Options → Social). Until then, the stats below may be
              incomplete or empty.
            </p>
          </div>
        </section>
      )}

      <section aria-label="Record" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {record ? (
          <>
            <StatTile
              label="Win rate"
              value={formatPercent(rate)}
              meter={rate}
              tone={rate !== null && rate >= 0.5 ? "win" : "loss"}
              detail={`${plural(record.wins, "win")} · ${plural(record.losses, "loss")}`}
            />
            <StatTile
              label="Games played"
              value={games.toLocaleString("en-US")}
              detail="All public matches on OpenDota"
            />
          </>
        ) : (
          <p
            role="alert"
            className="panel flex items-center p-4 text-sm text-muted-foreground sm:col-span-2"
          >
            {upstreamErrorCopy(
              view.record.ok ? { type: "unavailable" } : view.record.error,
              "the win/loss record",
            )}
          </p>
        )}
        <StatTile
          label="Most played hero"
          value={favourite ? heroName(heroes.get(favourite.heroId), favourite.heroId) : "—"}
          detail={
            favourite
              ? `${plural(favourite.games, "game")} · ${formatPercent(winRate(favourite.wins, favourite.games))} win rate`
              : "No hero stats yet"
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PlaysWithCard
            peers={teammates}
            now={now}
            error={view.peers.ok ? null : upstreamErrorCopy(view.peers.error, "teammates")}
          />
        </div>
        <div className="lg:col-span-2">
          <MostPlayedHeroesCard
            heroes={heroUsage}
            catalog={heroes}
            error={view.heroes.ok ? null : upstreamErrorCopy(view.heroes.error, "hero stats")}
          />
        </div>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="recent-matches">
        <div className="p-5 pb-3">
          <p className="kicker">Match history</p>
          <h2 id="recent-matches" className="text-lg font-semibold">
            Recent matches
          </h2>
        </div>
        {!view.matches.ok ? (
          <p
            role="alert"
            className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground"
          >
            {upstreamErrorCopy(view.matches.error, "recent matches")}
          </p>
        ) : matches.length === 0 ? (
          <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
            No public matches to show.
          </p>
        ) : (
          <MatchRows matches={matches} heroes={heroes} now={now} />
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Data from{" "}
        <a
          href={`https://www.opendota.com/players/${accountId32}`}
          target="_blank"
          rel="noreferrer"
          className="text-gold hover:underline"
        >
          OpenDota
        </a>
        . Public matches only; stats can lag a few minutes behind.
      </p>
    </div>
  );
}
