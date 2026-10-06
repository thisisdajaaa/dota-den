import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import { getHeroMap } from "@/modules/matches/composition";
import { ESTIMATE_PER_GAME } from "@/modules/mmr/domain/calendar";
import { getViewerTimeZone } from "@/modules/mmr/composition";
import { getSessionService } from "@/modules/sessions/composition";
import { EarlierNotes } from "@/modules/sessions/ui/earlier-notes";
import { GapSelector } from "@/modules/sessions/ui/gap-selector";
import { SessionList } from "@/modules/sessions/ui/session-list";
import { AfterLossesPanel } from "@/modules/sessions/ui/tilt-cards";

export const metadata: Metadata = { title: "Sessions" };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function pageHref(page: number): string {
  return page <= 1 ? "/sessions" : `/sessions?page=${page}`;
}

export default async function SessionsPage({ searchParams }: PageProps<"/sessions">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const requested = Number.parseInt(one((await searchParams).page) ?? "1", 10);
  const owner = { userId: user.id, accountId32: user.accountId32 };

  const [service, heroes, { timeZone }] = await Promise.all([
    getSessionService(),
    getHeroMap(),
    getViewerTimeZone(),
  ]);
  const [page, tilt] = await Promise.all([
    service.list(owner, Number.isFinite(requested) ? requested : 1),
    service.tilt(owner).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Progression"
        title="Sessions"
        description="Your games grouped into play sessions. Open one for a recap, and write down what you learned and what to try next time."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GapSelector value={page.gapMinutes} />
        {page.totalSessions > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {page.totalSessions.toLocaleString("en-US")}{" "}
            {page.totalSessions === 1 ? "session" : "sessions"} from{" "}
            {page.totalMatches.toLocaleString("en-US")}{" "}
            {page.totalMatches === 1 ? "match" : "matches"}
          </p>
        )}
      </div>

      {tilt && tilt.stats.baseline.games >= 20 && page.page === 1 && (
        <AfterLossesPanel stats={tilt.stats} />
      )}

      {page.items.length === 0 ? (
        <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
            <History aria-hidden className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">No sessions yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Sessions are built from your imported matches. Open your overview to sync your match
            history, then come back here.
          </p>
          <Link href="/dashboard" className="text-sm text-gold hover:underline">
            Go to overview
          </Link>
        </section>
      ) : (
        <section className="panel overflow-hidden" aria-labelledby="sessions-title">
          <div className="flex items-baseline justify-between gap-3 p-5 pb-3">
            <div>
              <p className="kicker">Newest first</p>
              <h2 id="sessions-title" className="text-lg font-semibold">
                Recent sessions
              </h2>
            </div>
            {page.pageCount > 1 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {page.page} of {page.pageCount}
              </span>
            )}
          </div>
          <div className="border-t border-white/[0.06]">
            <SessionList items={page.items} heroes={heroes} timeZone={timeZone} />
          </div>
          <nav
            aria-label="Session pages"
            className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-sm"
          >
            {page.page > 1 ? (
              <Link
                href={pageHref(page.page - 1)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft aria-hidden className="size-4" /> Newer sessions
              </Link>
            ) : (
              <span />
            )}
            {page.page < page.pageCount && (
              <Link
                href={pageHref(page.page + 1)}
                className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
              >
                Older sessions <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </nav>
        </section>
      )}

      {page.page === 1 && page.earlierNotes.length > 0 && (
        <section className="panel space-y-3 p-5" aria-labelledby="earlier-notes-title">
          <div>
            <p className="kicker">Kept for you</p>
            <h2 id="earlier-notes-title" className="text-lg font-semibold">
              Notes from a different grouping
            </h2>
            <p className="text-sm text-muted-foreground">
              You wrote these when your games were split with another break length, so they
              don&apos;t match a session exactly any more. Switch the break back to see them on
              their session again.
            </p>
          </div>
          <EarlierNotes items={page.earlierNotes} timeZone={timeZone} />
        </section>
      )}

      <p className="flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          MMR changes are exact only when you logged your MMR before and after a session with no
          other ranked games in between. Otherwise they&apos;re an estimate (≈, dashed) of ±
          {ESTIMATE_PER_GAME} per ranked win or loss. Times are shown in{" "}
          {timeZone === "UTC" ? "UTC" : "your time zone"}.
        </span>
      </p>
    </div>
  );
}
