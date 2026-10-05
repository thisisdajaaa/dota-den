import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getAiOpponent } from "@/modules/drafts/composition";
import { DraftRead } from "@/modules/drafts/ui/draft-read";
import { getLiveService } from "@/modules/live/composition";
import { clock, draftComplete, leadText, sideHeroes } from "@/modules/live/domain/live-game";
import { AutoRefresh } from "@/modules/live/ui/auto-refresh";
import { LineupRow } from "@/modules/live/ui/live-game-card";
import { WatchSection } from "@/modules/live/ui/watch-section";
import { getHeroMap } from "@/modules/matches/composition";

export const metadata: Metadata = { title: "Live game" };

const MATCH_ID = /^\d{1,20}$/;

export default async function LiveGamePage({ params }: PageProps<"/live/[matchId]">) {
  const { matchId } = await params;
  const [game, heroes] = await Promise.all([
    MATCH_ID.test(matchId) ? getLiveService().game(matchId) : null,
    getHeroMap(),
  ]);
  const back = (
    <Link
      href="/live"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" /> All live games
    </Link>
  );
  if (!game) {
    return (
      <div className="space-y-6">
        {back}
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <h1 className="text-lg font-semibold">This game isn&apos;t live anymore</h1>
          {MATCH_ID.test(matchId) && (
            <Link href={`/matches/${matchId}`} className="text-sm text-gold hover:underline">
              See the finished match
            </Link>
          )}
        </section>
      </div>
    );
  }

  const name = (s: "radiant" | "dire") => game.teams[s] ?? (s === "radiant" ? "Radiant" : "Dire");
  const [outlook, watch] = await Promise.all([
    draftComplete(game)
      ? getAiOpponent()
          .then((ai) => ai.outlookForHeroes(sideHeroes(game, "radiant"), sideHeroes(game, "dire")))
          .catch(() => null)
      : null,
    getLiveService().watch(game),
  ]);

  return (
    <div className="space-y-6">
      {back}
      <AutoRefresh seconds={30} />
      <PageHeader
        kicker={game.leagueName ?? (game.leagueId ? "League game" : "Public game")}
        title={game.leagueId ? `${name("radiant")} vs ${name("dire")}` : "Live public game"}
        description={
          game.averageMmr
            ? `Average MMR ${game.averageMmr.toLocaleString("en-US")}, as reported by the game.`
            : undefined
        }
      />

      <section
        aria-label="Now"
        className="panel grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
      >
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-win">{name("radiant")}</p>
          <p className="text-3xl font-bold tabular-nums">{game.score.radiant}</p>
        </div>
        <div className="text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-loss">
            <Radio aria-hidden className="size-3" /> Live
          </p>
          <p className="text-xl font-semibold tabular-nums">{clock(game.gameTimeSec)}</p>
          <p className="text-xs text-muted-foreground">{leadText(game)}</p>
          {game.delaySec > 0 && (
            <p className="text-[0.7rem] text-muted-foreground">
              Feed {Math.round(game.delaySec / 60)} min behind the game
            </p>
          )}
        </div>
        <div className="text-center sm:text-right">
          <p className="text-sm font-semibold text-loss">{name("dire")}</p>
          <p className="text-3xl font-bold tabular-nums">{game.score.dire}</p>
        </div>
      </section>

      <WatchSection streams={watch.streams} links={watch.links} />

      <section aria-label="Lineups" className="panel space-y-4 p-5">
        <div>
          <p className="kicker text-win">{name("radiant")}</p>
          <LineupRow game={game} side="radiant" heroes={heroes} names />
        </div>
        <div>
          <p className="kicker text-loss">{name("dire")}</p>
          <LineupRow game={game} side="dire" heroes={heroes} names />
        </div>
      </section>

      {outlook ? (
        <DraftRead
          outlook={outlook}
          name={name}
          outcome={(favoured) => {
            const leader =
              game.radiantLead > 500 ? "radiant" : game.radiantLead < -500 ? "dire" : null;
            return leader
              ? leader === favoured
                ? `${name(leader)} is ahead, as the draft suggested.`
                : `${name(leader)} is ahead despite the draft.`
              : "The game itself is even so far.";
          }}
        />
      ) : (
        <p className="panel p-5 text-sm text-muted-foreground">
          The draft analysis appears once both teams have picked all five heroes.
        </p>
      )}
    </div>
  );
}
