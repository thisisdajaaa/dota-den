import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, ThumbsDown, Trophy } from "lucide-react";
import { StatTile } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { getHeroMap } from "@/modules/matches/composition";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { getViewerTimeZone } from "@/common/http/request-context";
import { toSessionNoteDto } from "@/modules/sessions/dtos/responses/session-note.dto";
import { sessionService } from "@/modules/sessions";
import { sessionIdFromParam, type GamePick } from "@/modules/sessions/domain/session";
import {
  formatSpan,
  recapHeadline,
  sessionTimeLabels,
} from "@/modules/sessions/domain/session-labels";
import type { SessionMmr } from "@/modules/sessions/domain/session-mmr";
import { EarlierNotes } from "@/modules/sessions/ui/earlier-notes";
import { ESTIMATE_REASONS, MmrChangeBadge } from "@/modules/sessions/ui/mmr-change-badge";
import { queueMix, SessionRecord } from "@/modules/sessions/ui/session-list";
import { SessionNoteForm } from "@/modules/sessions/ui/session-note-form";

export const metadata: Metadata = { title: "Session recap" };

export default async function SessionPage({ params }: PageProps<"/sessions/[sessionId]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sessionId = sessionIdFromParam((await params).sessionId);
  if (!sessionId) notFound();

  const service = sessionService;
  const [heroes, { timeZone }] = await Promise.all([getHeroMap(), getViewerTimeZone()]);
  const detail = await service.detail(
    { userId: user.id, accountId32: user.accountId32 },
    sessionId,
  );
  if (!detail) notFound();

  const { session, mmr, note } = detail;
  const s = session.stats;
  const labels = sessionTimeLabels(session.startedAt, session.endedAt, timeZone);
  const winRate = s.games ? s.wins / s.games : null;
  const now = new Date();
  const dateTime = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <nav aria-label="Session navigation" className="flex items-center justify-between gap-3">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" /> All sessions
        </Link>
        <div className="flex items-center gap-1">
          {detail.olderId && (
            <Link
              href={`/sessions/${detail.olderId}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            >
              <ChevronLeft aria-hidden className="size-3.5" /> Previous
            </Link>
          )}
          {detail.newerId && (
            <Link
              href={`/sessions/${detail.newerId}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            >
              Next <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          )}
        </div>
      </nav>

      <PageHeader
        kicker="Session recap"
        title={labels.date}
        description={`${labels.timeRange} · ${s.games === 1 ? "1 game" : `${s.games} games`}`}
      />

      <section className="panel space-y-3 p-5" aria-labelledby="recap-title">
        <p className="kicker">Recap</p>
        <h2 id="recap-title" className="text-xl font-semibold sm:text-2xl">
          {recapHeadline(s, mmr)}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <SessionRecord wins={s.wins} losses={s.losses} className="text-lg" />
          <MmrChangeBadge mmr={mmr} />
        </div>
        <MmrExplanation mmr={mmr} format={(d) => dateTime.format(d)} />
      </section>

      <section aria-label="Session stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Record"
          value={`${s.wins}–${s.losses}`}
          meter={winRate}
          tone={winRate !== null && winRate >= 0.5 ? "win" : "loss"}
          detail={`${formatPercent(winRate)} win rate`}
        />
        <StatTile
          label="Ranked"
          value={s.ranked.games ? `${s.ranked.wins}–${s.ranked.losses}` : "—"}
          detail={
            s.ranked.games
              ? `${s.ranked.games} ranked of ${s.games}`
              : "No ranked games this session"
          }
          tone="gold"
        />
        <StatTile
          label="Time in games"
          value={formatSpan(s.playSec)}
          detail={`${formatSpan(s.spanSec)} from first game's start to last game's end, breaks included`}
        />
        <StatTile
          label="Queue"
          value={`${s.queue.solo} / ${s.queue.party}`}
          detail={
            <>
              Solo / party{s.queue.unknown > 0 && ` · ${s.queue.unknown} unknown`}
              <span className="sr-only">: {queueMix(s.queue)}</span>
            </>
          }
          tone="muted"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="panel space-y-4 p-5" aria-labelledby="highlights-title">
            <div>
              <p className="kicker">Highlights</p>
              <h2 id="highlights-title" className="text-lg font-semibold">
                Streaks and standout games
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <dt className="text-xs text-muted-foreground">Longest win streak</dt>
                <dd className="text-2xl font-semibold text-win tabular-nums">
                  {s.longestWinStreak}
                </dd>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <dt className="text-xs text-muted-foreground">Longest loss streak</dt>
                <dd className="text-2xl font-semibold text-loss tabular-nums">
                  {s.longestLossStreak}
                </dd>
              </div>
            </dl>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StandoutGame kind="best" pick={s.best} heroes={heroes} />
              <StandoutGame kind="worst" pick={s.worst} heroes={heroes} />
            </div>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-px size-3.5 shrink-0" />
              Best game is the win with the highest kills + assists − deaths; worst game is the loss
              with the lowest. Ties go to the earlier game.
            </p>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="session-matches-title">
            <div className="p-5 pb-3">
              <p className="kicker">In the order you played them</p>
              <h2 id="session-matches-title" className="text-lg font-semibold">
                Matches
              </h2>
            </div>
            <MatchRows matches={session.matches} heroes={heroes} now={now} />
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="panel space-y-4 p-5" aria-labelledby="notes-title">
            <div>
              <p className="kicker">Private to you</p>
              <h2 id="notes-title" className="text-lg font-semibold">
                Notes &amp; goal
              </h2>
            </div>
            {detail.earlierNotes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Notes you saved when these games were grouped with a different break length:
                </p>
                <EarlierNotes
                  items={detail.earlierNotes.map((n) => ({
                    note: n,
                    currentSessionId: session.id,
                  }))}
                  timeZone={timeZone}
                  linkToSession={false}
                />
              </div>
            )}
            <SessionNoteForm
              sessionId={session.id}
              initial={note ? toSessionNoteDto(note) : null}
            />
          </section>

          <section className="panel p-5" aria-labelledby="heroes-title">
            <p className="kicker">Heroes</p>
            <h2 id="heroes-title" className="mb-3 text-lg font-semibold">
              {s.heroes.length === 1 ? "1 hero played" : `${s.heroes.length} heroes played`}
            </h2>
            <ul className="space-y-2">
              {s.heroes.map((h) => (
                <li key={h.heroId} className="flex items-center gap-3">
                  <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {heroName(heroes.get(h.heroId), h.heroId)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {h.games === 1 ? "1 game" : `${h.games} games`}
                  </span>
                  <SessionRecord wins={h.wins} losses={h.games - h.wins} className="text-xs" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function MmrExplanation({ mmr, format }: { mmr: SessionMmr; format: (d: Date) => string }) {
  if (mmr.kind === "none") {
    return (
      <p className="text-sm text-muted-foreground">
        No ranked games this session, so your MMR didn&apos;t change.
      </p>
    );
  }
  if (mmr.kind === "exact") {
    return (
      <p className="text-sm text-muted-foreground">
        Exact, from your MMR journal: {mmr.from.mmr.toLocaleString("en-US")} logged{" "}
        {format(mmr.from.observedAt)} → {mmr.to.mmr.toLocaleString("en-US")} logged{" "}
        {format(mmr.to.observedAt)}, with no other ranked games in between.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Estimate only: ±{mmr.perGame} per ranked win or loss over {mmr.rankedGames} ranked{" "}
      {mmr.rankedGames === 1 ? "game" : "games"}. {ESTIMATE_REASONS[mmr.reason]}{" "}
      <Link href="/mmr" className="text-gold hover:underline">
        Open MMR journal
      </Link>
    </p>
  );
}

function StandoutGame({
  kind,
  pick,
  heroes,
}: {
  kind: "best" | "worst";
  pick: GamePick | null;
  heroes: Map<number, HeroInfo>;
}) {
  const best = kind === "best";
  const Icon = best ? Trophy : ThumbsDown;
  const title = best ? "Best game" : "Worst game";
  if (!pick) {
    return (
      <div className="rounded-lg border border-dashed border-white/[0.08] p-3">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {best ? "No wins this session." : "No losses this session."}
        </p>
      </div>
    );
  }
  const m = pick.match;
  const hero = heroes.get(m.heroId);
  return (
    <Link
      href={`/matches/${m.matchId}`}
      className="group block rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
    >
      <p className={`flex items-center gap-1.5 text-xs ${best ? "text-win" : "text-loss"}`}>
        <Icon aria-hidden className="size-3.5" /> {title}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <HeroPortrait hero={hero} heroId={m.heroId} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium group-hover:text-gold">
            {heroName(hero, m.heroId)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {m.kills}/{m.deaths}/{m.assists} · {best ? "Win" : "Loss"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {best ? "Highest" : "Lowest"} K+A−D: {m.kills} + {m.assists} − {m.deaths} ={" "}
        <span className="font-semibold text-foreground tabular-nums">{pick.score}</span>
      </p>
    </Link>
  );
}
