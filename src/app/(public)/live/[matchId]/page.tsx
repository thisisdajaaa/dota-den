import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { getAiOpponent } from "@/modules/drafts/composition";
import type { DraftOutlook } from "@/modules/drafts/domain/draft-outlook";
import { getLiveService } from "@/modules/live/composition";
import {
  clock,
  draftComplete,
  leadText,
  sideHeroes,
  type LiveGame,
} from "@/modules/live/domain/live-game";
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
        <DraftRead outlook={outlook} game={game} name={name} />
      ) : (
        <p className="panel p-5 text-sm text-muted-foreground">
          The draft analysis appears once both teams have picked all five heroes.
        </p>
      )}
    </div>
  );
}

function DraftRead({
  outlook,
  game,
  name,
}: {
  outlook: DraftOutlook;
  game: LiveGame;
  name: (s: "radiant" | "dire") => string;
}) {
  const r = outlook.radiantPct ?? 50;
  const favoured = r > 50 ? "radiant" : r < 50 ? "dire" : null;
  const leader = game.radiantLead > 500 ? "radiant" : game.radiantLead < -500 ? "dire" : null;
  return (
    <section aria-labelledby="draft-read" className="panel space-y-4 p-5">
      <div>
        <h2 id="draft-read" className="text-lg font-semibold">
          The draft
        </h2>
        <p className="text-sm text-muted-foreground">
          {favoured
            ? `The draft favours ${name(favoured)} (${favoured === "radiant" ? r : 100 - r}%).`
            : "The draft looks even."}{" "}
          {leader
            ? leader === favoured
              ? `${name(leader)} is ahead, as the draft suggested.`
              : `${name(leader)} is ahead despite the draft.`
            : "The game itself is even so far."}
        </p>
      </div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={`Estimated win chance from the draft: ${name("radiant")} ${r}%, ${name("dire")} ${100 - r}%`}
      >
        <span className="bg-win/80" style={{ width: `${r}%` }} />
        <span className="bg-loss/80" style={{ width: `${100 - r}%` }} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["radiant", "dire"] as const).map((s) => {
          const rep = outlook.report[s];
          return (
            <div key={s} className="rounded-lg border border-white/[0.06] p-3">
              <p
                className={cn("text-sm font-semibold", s === "radiant" ? "text-win" : "text-loss")}
              >
                {name(s)}: {rep.grade ?? "—"}
                {rep.overall !== null && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {" "}
                    {rep.overall}/100
                  </span>
                )}
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                {rep.criteria.map((c) => (
                  <li key={c.key}>
                    <span className="text-foreground">{c.label}</span> {c.grade ?? "—"}: {c.summary}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {outlook.notes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {outlook.notes.slice(0, 4).map((n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-gold" />
              {n}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Estimated from the draft alone, with the same data and report card as the draft trainer. It
        picked the winner {Math.round(outlook.accuracy.fitted * 100)}% of the time on recent
        high-rank games it hadn&apos;t seen, so treat it as a read, not a prediction.
      </p>
    </section>
  );
}
