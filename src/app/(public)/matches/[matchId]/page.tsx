import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, Info } from "lucide-react";
import { cn } from "cn";
import { LocalTime } from "@/components/local-time";
import { annotationsService } from "@/modules/annotations";
import { MatchNotesCard } from "@/modules/annotations/ui/match-notes-card";
import { getAiOpponent } from "@/modules/drafts/composition";
import { DraftRead } from "@/modules/drafts/ui/draft-read";
import { getCurrentUser } from "@/modules/identity";
import { getHeroMap, getItemMap, getOpenDotaAdapter } from "@/modules/matches/composition";
import { partyGroups } from "@/modules/matches/domain/match-detail";
import { isRanked } from "@/modules/matches/domain/queue-classification";
import { averageRankTier } from "@/modules/matches/domain/rank-tier";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { AdvantageChart } from "@/modules/matches/ui/advantage-chart";
import { formatDuration, gameModeLabel, regionLabel } from "@/modules/matches/ui/format";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { LaningCard } from "@/modules/matches/ui/laning-card";
import { WardMapCard } from "@/modules/matches/ui/ward-map-card";
import { PerformanceCard } from "@/modules/matches/ui/performance-card";
import { Scoreboard } from "@/modules/matches/ui/scoreboard";

const MATCH_ID = /^\d{1,20}$/;

export async function generateMetadata({
  params,
}: PageProps<"/matches/[matchId]">): Promise<Metadata> {
  const { matchId } = await params;
  return { title: `Match ${matchId}` };
}

export default async function MatchPage({ params, searchParams }: PageProps<"/matches/[matchId]">) {
  const { matchId } = await params;
  const slotParam = (await searchParams).p;
  if (!MATCH_ID.test(matchId)) notFound();

  const [result, heroes, items, viewer] = await Promise.all([
    getOpenDotaAdapter().fetchMatch(matchId),
    getHeroMap(),
    getItemMap(),
    getCurrentUser({ tolerateErrors: true }),
  ]);

  if (!result.ok) {
    if (result.error.type === "not_found") notFound();
    return (
      <div className="space-y-6">
        <BackLink signedIn={viewer !== null} />
        <section
          className="panel grid place-items-center gap-3 px-6 py-16 text-center"
          role="alert"
        >
          <AlertTriangle aria-hidden className="size-8 text-loss" />
          <h1 className="text-lg font-semibold">Couldn&apos;t load match {matchId}</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {result.error.type === "rate_limited"
              ? "OpenDota is rate limiting requests right now. Try again in a minute."
              : "OpenDota is unavailable right now. Try again shortly."}
          </p>
        </section>
      </div>
    );
  }

  const match = result.value;
  const radiant = match.players.filter((p) => p.side === "radiant");
  const dire = match.players.filter((p) => p.side === "dire");
  const parties = partyGroups(match.players);
  const viewerAccountId = viewer?.accountId32 ?? null;
  const me =
    viewerAccountId !== null
      ? match.players.find((p) => p.accountId32 === viewerAccountId)
      : undefined;
  const myWin = me ? (me.side === "radiant") === match.radiantWin : null;
  // "How did I play?": you by default, or the player picked with ?p=<slot>.
  const picked =
    typeof slotParam === "string" && /^\d{1,3}$/.test(slotParam)
      ? match.players.find((p) => p.playerSlot === Number(slotParam))
      : undefined;
  const perfPlayer = picked ?? me ?? null;
  const region = regionLabel(match.region);
  const avgRank = averageRankTier(match.players.map((p) => p.rankTier));

  return (
    <div className="space-y-6">
      <BackLink signedIn={viewer !== null} />

      <section className="panel relative overflow-hidden px-5 py-8 sm:px-8">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 opacity-60",
            match.radiantWin
              ? "bg-[radial-gradient(40rem_16rem_at_0%_0%,oklch(0.66_0.12_190/0.25),transparent)]"
              : "bg-[radial-gradient(40rem_16rem_at_100%_0%,oklch(0.56_0.19_32/0.25),transparent)]",
          )}
        />
        <div className="relative flex flex-col items-center gap-6 text-center">
          <div className="space-y-2">
            <p className="kicker">Match {match.matchId}</p>
            <h1
              className={cn(
                "font-display text-3xl font-bold tracking-wider sm:text-5xl",
                match.radiantWin ? "text-win" : "text-loss",
              )}
            >
              {match.radiantWin ? "Radiant" : "Dire"} Victory
            </h1>
          </div>

          <div
            className="flex items-center gap-6 sm:gap-10"
            aria-label={`Score: Radiant ${match.radiantScore}, Dire ${match.direScore}`}
          >
            <div className="text-right">
              <div className="text-xs tracking-widest text-muted-foreground uppercase">Radiant</div>
              <div
                className={cn("text-4xl font-semibold sm:text-5xl", match.radiantWin && "text-win")}
              >
                {match.radiantScore}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Clock aria-hidden className="size-4" />
              <span className="text-sm tabular-nums">{formatDuration(match.durationSec)}</span>
            </div>
            <div className="text-left">
              <div className="text-xs tracking-widest text-muted-foreground uppercase">Dire</div>
              <div
                className={cn(
                  "text-4xl font-semibold sm:text-5xl",
                  !match.radiantWin && "text-loss",
                )}
              >
                {match.direScore}
              </div>
            </div>
          </div>

          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li>{gameModeLabel(match.gameMode)}</li>
            <li>{isRanked(match.lobbyType) ? "Ranked" : "Unranked"}</li>
            <li>
              <LocalTime iso={match.startedAt.toISOString()} />
            </li>
            {region && <li>{region}</li>}
            {match.firstBloodSec !== null && (
              <li>First blood {formatDuration(match.firstBloodSec)}</li>
            )}
          </ul>
          {avgRank && (
            <p className="flex items-center gap-2 text-sm">
              <RankMedal rank={avgRank.rank} size={32} />
              <span>
                Average rank{" "}
                <span className="font-semibold text-gold">{rankLabel(avgRank.rank)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {avgRank.ranked} of {match.players.length} players show a rank
                </span>
              </span>
            </p>
          )}

          {me && myWin !== null && (
            <p
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm",
                myWin ? "border-win/40 bg-win/10" : "border-loss/40 bg-loss/10",
              )}
            >
              You{" "}
              <span className={cn("font-semibold", myWin ? "text-win" : "text-loss")}>
                {myWin ? "won" : "lost"}
              </span>{" "}
              as <span className="font-semibold">{heroName(heroes.get(me.heroId), me.heroId)}</span>{" "}
              · {me.kills}/{me.deaths}/{me.assists}
            </p>
          )}
        </div>
      </section>

      {!match.parsed && (
        <div className="panel flex gap-3 p-4 text-sm text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
          <p>
            This match hasn&apos;t been replay-parsed by OpenDota yet, so the advantage graph and
            some stats (damage, healing, net worth) aren&apos;t available. Basic scoreboard data is
            shown.
          </p>
        </div>
      )}

      <PerformanceCard
        players={match.players}
        selected={perfPlayer}
        isViewer={perfPlayer !== null && perfPlayer === me}
        heroes={heroes}
        hrefFor={(slot) => `/matches/${match.matchId}?p=${slot}#performance`}
      />

      <Suspense fallback={null}>
        <MatchDraftSection
          radiant={radiant.map((p) => p.heroId)}
          dire={dire.map((p) => p.heroId)}
          radiantWin={match.radiantWin}
        />
      </Suspense>

      {me && viewer && (
        <Suspense fallback={null}>
          <NotesSection userId={viewer.id} matchId={match.matchId} />
        </Suspense>
      )}

      <LaningCard
        matchId={match.matchId}
        players={match.players}
        selected={perfPlayer}
        isViewer={perfPlayer !== null && perfPlayer === me}
        heroes={heroes}
        items={items}
      />

      {perfPlayer?.map && (
        <WardMapCard
          map={perfPlayer.map}
          heroLabel={heroName(heroes.get(perfPlayer.heroId), perfPlayer.heroId)}
        />
      )}

      {match.goldAdvantage && (
        <section className="panel p-5" aria-labelledby="advantage">
          <p className="kicker">Momentum</p>
          <h2 id="advantage" className="mb-3 text-lg font-semibold">
            Team advantage
          </h2>
          <AdvantageChart gold={match.goldAdvantage} xp={match.xpAdvantage} />
        </section>
      )}

      <Scoreboard
        side="radiant"
        won={match.radiantWin}
        score={match.radiantScore}
        players={radiant}
        parties={parties}
        heroes={heroes}
        items={items}
        viewerAccountId={viewerAccountId}
      />
      <Scoreboard
        side="dire"
        won={!match.radiantWin}
        score={match.direScore}
        players={dire}
        parties={parties}
        heroes={heroes}
        items={items}
        viewerAccountId={viewerAccountId}
      />

      <p className="text-xs text-muted-foreground">
        Data from OpenDota, fetched <LocalTime iso={match.fetchedAt.toISOString()} />. Players
        marked P1, P2… queued together as a party. Players who keep their profile anonymous stay
        anonymous here.
      </p>
    </div>
  );
}

function BackLink({ signedIn }: { signedIn: boolean }) {
  return (
    <Link
      href={signedIn ? "/dashboard" : "/"}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {signedIn ? "Back to dashboard" : "Home"}
    </Link>
  );
}

async function MatchDraftSection({
  radiant,
  dire,
  radiantWin,
}: {
  radiant: number[];
  dire: number[];
  radiantWin: boolean;
}) {
  if (radiant.length !== 5 || dire.length !== 5) return null;
  const outlook = await (await getAiOpponent()).outlookForHeroes(radiant, dire).catch(() => null);
  if (!outlook || outlook.radiantPct === null) return null;
  const name = (s: "radiant" | "dire") => (s === "radiant" ? "Radiant" : "Dire");
  const winner = radiantWin ? "radiant" : "dire";
  return (
    <DraftRead
      outlook={outlook}
      name={name}
      outcome={(favoured) =>
        favoured
          ? favoured === winner
            ? `${name(winner)} won, as the draft suggested.`
            : `${name(winner)} won despite the draft.`
          : `${name(winner)} won.`
      }
    />
  );
}

async function NotesSection({ userId, matchId }: { userId: string; matchId: string }) {
  const a = await annotationsService.get(userId, matchId).catch(() => null);
  return (
    <MatchNotesCard matchId={matchId} initialTags={a?.tags ?? []} initialNote={a?.note ?? ""} />
  );
}
