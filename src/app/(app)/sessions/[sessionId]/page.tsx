import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Info, ThumbsDown, Trophy } from "lucide-react";
import type { Messages } from "@/common/i18n/messages";
import { getT } from "@/common/i18n/server";
import { plural, type Translator } from "@/common/i18n/translate";
import { StatTile } from "@/components/stat-tile";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { matchesService } from "@/modules/matches";
import { formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { MatchRows } from "@/modules/matches/ui/recent-matches-card";
import { getViewerTimeZone } from "@/common/http/request-context";
import { toSessionNoteDto } from "@/modules/sessions/dtos/responses/session-note.dto";
import { sessionService } from "@/modules/sessions";
import { sessionIdFromParam, type GamePick } from "@/modules/sessions/domain/session";
import { formatSpan, sessionTimeLabels, signedMmr } from "@/modules/sessions/domain/session-labels";
import type { SessionMmr } from "@/modules/sessions/domain/session-mmr";
import { EarlierNotes } from "@/modules/sessions/ui/earlier-notes";
import { ESTIMATE_REASONS, MmrChangeBadge } from "@/modules/sessions/ui/mmr-change-badge";
import { queueMix, SessionRecord } from "@/modules/sessions/ui/session-list";
import { SessionNoteForm } from "@/modules/sessions/ui/session-note-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sessions.detail.title") };
}

/** One-sentence recap, e.g. "4–2 in 3h 10m, +50 MMR (exact)". */
function recapHeadline(
  t: Translator<Messages>,
  stats: { wins: number; losses: number; spanSec: number },
  mmr: SessionMmr,
): string {
  const vars = { wins: stats.wins, losses: stats.losses, span: formatSpan(stats.spanSec) };
  if (mmr.kind === "none") return t("sessions.detail.headlineNone", vars);
  const value = signedMmr(mmr.delta);
  return mmr.kind === "exact"
    ? t("sessions.detail.headlineExact", { ...vars, value })
    : t("sessions.detail.headlineEstimate", { ...vars, value });
}

export default async function SessionPage({ params }: PageProps<"/sessions/[sessionId]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const sessionId = sessionIdFromParam((await params).sessionId);
  if (!sessionId) notFound();

  const service = sessionService;
  const [heroes, { timeZone }] = await Promise.all([matchesService.heroMap(), getViewerTimeZone()]);
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
      <nav
        aria-label={t("sessions.detail.nav")}
        className="flex items-center justify-between gap-3"
      >
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" /> {t("sessions.detail.all")}
        </Link>
        <div className="flex items-center gap-1">
          {detail.olderId && (
            <Link
              href={`/sessions/${detail.olderId}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            >
              <ChevronLeft aria-hidden className="size-3.5" /> {t("sessions.detail.previous")}
            </Link>
          )}
          {detail.newerId && (
            <Link
              href={`/sessions/${detail.newerId}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            >
              {t("sessions.detail.next")} <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          )}
        </div>
      </nav>

      <PageHeader
        kicker={t("sessions.detail.title")}
        title={labels.date}
        description={`${labels.timeRange} · ${plural(t, "sessions.item.games", s.games)}`}
      />

      <section className="panel space-y-3 p-5" aria-labelledby="recap-title">
        <p className="kicker">{t("sessions.detail.recap")}</p>
        <h2 id="recap-title" className="text-xl font-semibold sm:text-2xl">
          {recapHeadline(t, s, mmr)}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <SessionRecord wins={s.wins} losses={s.losses} className="text-lg" />
          <MmrChangeBadge mmr={mmr} />
        </div>
        <MmrExplanation t={t} mmr={mmr} format={(d) => dateTime.format(d)} />
      </section>

      <section
        aria-label={t("sessions.detail.stats")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatTile
          label={t("sessions.detail.record")}
          value={`${s.wins}–${s.losses}`}
          meter={winRate}
          tone={winRate !== null && winRate >= 0.5 ? "win" : "loss"}
          detail={t("sessions.detail.winRate", { rate: formatPercent(winRate) })}
        />
        <StatTile
          label={t("sessions.detail.ranked")}
          value={s.ranked.games ? `${s.ranked.wins}–${s.ranked.losses}` : "—"}
          detail={
            s.ranked.games
              ? t("sessions.detail.rankedOf", { ranked: s.ranked.games, games: s.games })
              : t("sessions.detail.noRanked")
          }
          tone="gold"
        />
        <StatTile
          label={t("sessions.detail.time")}
          value={formatSpan(s.playSec)}
          detail={t("sessions.detail.spanDetail", { span: formatSpan(s.spanSec) })}
        />
        <StatTile
          label={t("sessions.detail.queue")}
          value={`${s.queue.solo} / ${s.queue.party}`}
          detail={
            <>
              {t("sessions.detail.soloParty")}
              {s.queue.unknown > 0 && ` · ${t("sessions.detail.unknown", { n: s.queue.unknown })}`}
              <span className="sr-only">: {queueMix(t, s.queue)}</span>
            </>
          }
          tone="muted"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <section className="panel space-y-4 p-5" aria-labelledby="highlights-title">
            <div>
              <p className="kicker">{t("sessions.detail.highlightsKicker")}</p>
              <h2 id="highlights-title" className="text-lg font-semibold">
                {t("sessions.detail.highlightsTitle")}
              </h2>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <dt className="text-xs text-muted-foreground">{t("sessions.detail.longestWin")}</dt>
                <dd className="text-2xl font-semibold text-win tabular-nums">
                  {s.longestWinStreak}
                </dd>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <dt className="text-xs text-muted-foreground">
                  {t("sessions.detail.longestLoss")}
                </dt>
                <dd className="text-2xl font-semibold text-loss tabular-nums">
                  {s.longestLossStreak}
                </dd>
              </div>
            </dl>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StandoutGame t={t} kind="best" pick={s.best} heroes={heroes} />
              <StandoutGame t={t} kind="worst" pick={s.worst} heroes={heroes} />
            </div>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-px size-3.5 shrink-0" />
              {t("sessions.detail.standoutRule")}
            </p>
          </section>

          <section className="panel overflow-hidden" aria-labelledby="session-matches-title">
            <div className="p-5 pb-3">
              <p className="kicker">{t("sessions.detail.matchesKicker")}</p>
              <h2 id="session-matches-title" className="text-lg font-semibold">
                {t("sessions.detail.matchesTitle")}
              </h2>
            </div>
            <MatchRows matches={session.matches} heroes={heroes} now={now} />
          </section>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section className="panel space-y-4 p-5" aria-labelledby="notes-title">
            <div>
              <p className="kicker">{t("sessions.detail.notesKicker")}</p>
              <h2 id="notes-title" className="text-lg font-semibold">
                {t("sessions.detail.notesTitle")}
              </h2>
            </div>
            {detail.earlierNotes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("sessions.detail.earlierIntro")}</p>
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
            <p className="kicker">{t("sessions.detail.heroesKicker")}</p>
            <h2 id="heroes-title" className="mb-3 text-lg font-semibold">
              {plural(t, "sessions.detail.heroesPlayed", s.heroes.length)}
            </h2>
            <ul className="space-y-2">
              {s.heroes.map((h) => (
                <li key={h.heroId} className="flex items-center gap-3">
                  <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {heroName(heroes.get(h.heroId), h.heroId)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {plural(t, "sessions.item.games", h.games)}
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

function MmrExplanation({
  t,
  mmr,
  format,
}: {
  t: Translator<Messages>;
  mmr: SessionMmr;
  format: (d: Date) => string;
}) {
  if (mmr.kind === "none") {
    return <p className="text-sm text-muted-foreground">{t("sessions.detail.mmrNone")}</p>;
  }
  if (mmr.kind === "exact") {
    return (
      <p className="text-sm text-muted-foreground">
        {t("sessions.detail.mmrExact", {
          from: mmr.from.mmr.toLocaleString("en-US"),
          fromAt: format(mmr.from.observedAt),
          to: mmr.to.mmr.toLocaleString("en-US"),
          toAt: format(mmr.to.observedAt),
        })}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      {t("sessions.detail.mmrEstimate", {
        perGame: mmr.perGame,
        games: plural(t, "sessions.detail.rankedGames", mmr.rankedGames),
      })}{" "}
      {t(ESTIMATE_REASONS[mmr.reason])}{" "}
      <Link href="/mmr" className="text-gold hover:underline">
        {t("sessions.detail.openJournal")}
      </Link>
    </p>
  );
}

function StandoutGame({
  t,
  kind,
  pick,
  heroes,
}: {
  t: Translator<Messages>;
  kind: "best" | "worst";
  pick: GamePick | null;
  heroes: Map<number, HeroInfo>;
}) {
  const best = kind === "best";
  const Icon = best ? Trophy : ThumbsDown;
  const title = best ? t("sessions.detail.bestGame") : t("sessions.detail.worstGame");
  if (!pick) {
    return (
      <div className="rounded-lg border border-dashed border-white/[0.08] p-3">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {best ? t("sessions.detail.noWins") : t("sessions.detail.noLosses")}
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
            {m.kills}/{m.deaths}/{m.assists} ·{" "}
            {best ? t("sessions.detail.win") : t("sessions.detail.loss")}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(best ? "sessions.detail.highest" : "sessions.detail.lowest", {
          kills: m.kills,
          assists: m.assists,
          deaths: m.deaths,
        })}{" "}
        <span className="font-semibold text-foreground tabular-nums">{pick.score}</span>
      </p>
    </Link>
  );
}
