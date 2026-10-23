import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";
import { getAiOpponent } from "@/modules/drafts";
import { DraftRead } from "@/modules/drafts/ui/draft-read";
import { LIVE_CACHE_SECONDS, liveService } from "@/modules/live";
import { clock, draftComplete, sideHeroes, type LiveGame } from "@/modules/live/domain/live-game";
import { AutoRefresh } from "@/modules/live/ui/auto-refresh";
import { leadLabel, LineupRow } from "@/modules/live/ui/live-game-card";
import { WatchSection } from "@/modules/live/ui/watch-section";
import { matchesService } from "@/modules/matches";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("live.game.metaTitle") };
}

const MATCH_ID = /^\d{1,20}$/;

export default async function LiveGamePage({ params }: PageProps<"/live/[matchId]">) {
  const { matchId } = await params;
  const [game, heroes, t] = await Promise.all([
    MATCH_ID.test(matchId) ? liveService.game(matchId) : null,
    matchesService.heroMap(),
    getT(),
  ]);
  const back = (
    <Link
      href="/live"
      className="relative inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
    >
      <ArrowLeft aria-hidden className="size-4" /> {t("live.game.allLive")}
    </Link>
  );
  if (!game) {
    return (
      <div className="space-y-6">
        {back}
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <h1 className="text-lg font-semibold">{t("live.game.gone")}</h1>
          {MATCH_ID.test(matchId) && (
            <Link href={`/matches/${matchId}`} className="text-sm text-gold hover:underline">
              {t("live.game.seeFinished")}
            </Link>
          )}
        </section>
      </div>
    );
  }

  const name = (s: "radiant" | "dire") => game.teams[s] ?? (s === "radiant" ? "Radiant" : "Dire");

  return (
    <div className="space-y-6">
      {back}
      <AutoRefresh seconds={LIVE_CACHE_SECONDS} />
      <PageHeader
        kicker={game.leagueName ?? (game.leagueId ? t("live.leagueGame") : t("live.publicGame"))}
        title={
          game.leagueId
            ? t("live.versus", { radiant: name("radiant"), dire: name("dire") })
            : t("live.game.livePublic")
        }
        description={
          game.averageMmr
            ? t("live.game.averageMmr", { mmr: game.averageMmr.toLocaleString("en-US") })
            : undefined
        }
      />

      <section
        aria-label={t("live.game.now")}
        className="panel grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
      >
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-win">{name("radiant")}</p>
          <p className="text-3xl font-bold tabular-nums">{game.score.radiant}</p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-loss">
            <Radio aria-hidden className="size-3" /> {t("live.game.live")}
          </p>
          <p className="text-xl font-semibold tabular-nums">{clock(game.gameTimeSec)}</p>
          <p className="text-xs text-muted-foreground">{leadLabel(t, game)}</p>
          {game.delaySec > 0 && (
            <p className="text-[0.7rem] text-muted-foreground">
              {t("live.game.feedBehind", { min: Math.round(game.delaySec / 60) })}
            </p>
          )}
        </div>
        <div className="text-center sm:text-right">
          <p className="text-sm font-semibold text-loss">{name("dire")}</p>
          <p className="text-3xl font-bold tabular-nums">{game.score.dire}</p>
        </div>
      </section>

      {/* Twitch can be slow: show the score and lineups first. */}
      <Suspense fallback={<SectionSkeleton label={t("live.watch.title")} rows={2} />}>
        <Watch game={game} />
      </Suspense>

      <section aria-label={t("live.game.lineups")} className="panel space-y-4 p-5">
        <div>
          <p className="kicker text-win">{name("radiant")}</p>
          <LineupRow game={game} side="radiant" heroes={heroes} names />
        </div>
        <div>
          <p className="kicker text-loss">{name("dire")}</p>
          <LineupRow game={game} side="dire" heroes={heroes} names />
        </div>
      </section>

      <Suspense fallback={<SectionSkeleton label={t("live.game.draftPending")} rows={3} />}>
        <Outlook game={game} />
      </Suspense>
    </div>
  );
}

const teamName = (game: LiveGame, s: "radiant" | "dire") =>
  game.teams[s] ?? (s === "radiant" ? "Radiant" : "Dire");

/** Matching streams (Twitch) and search links. */
async function Watch({ game }: { game: LiveGame }) {
  const watch = await liveService.watch(game);
  return <WatchSection streams={watch.streams} links={watch.links} />;
}

/** The draft read, once both drafts are complete. */
async function Outlook({ game }: { game: LiveGame }) {
  const t = await getT();
  const outlook = draftComplete(game)
    ? await getAiOpponent()
        .then((ai) => ai.outlookForHeroes(sideHeroes(game, "radiant"), sideHeroes(game, "dire")))
        .catch(() => null)
    : null;
  if (!outlook)
    return <p className="panel p-5 text-sm text-muted-foreground">{t("live.game.draftPending")}</p>;
  const name = (s: "radiant" | "dire") => teamName(game, s);
  return (
    <DraftRead
      outlook={outlook}
      name={name}
      outcome={(favoured) => {
        const leader = game.radiantLead > 500 ? "radiant" : game.radiantLead < -500 ? "dire" : null;
        return leader
          ? leader === favoured
            ? t("live.game.aheadAsDrafted", { team: name(leader) })
            : t("live.game.aheadDespite", { team: name(leader) })
          : t("live.game.even");
      }}
    />
  );
}
