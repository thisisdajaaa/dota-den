import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Info } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";
import { ESTIMATE_PER_GAME } from "@/modules/mmr/domain/calendar";
import { getViewerTimeZone } from "@/common/http/request-context";
import { sessionService } from "@/modules/sessions";
import { EarlierNotes } from "@/modules/sessions/ui/earlier-notes";
import { GapSelector } from "@/modules/sessions/ui/gap-selector";
import { SessionList } from "@/modules/sessions/ui/session-list";
import { AfterLossesPanel } from "@/modules/sessions/ui/tilt-cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sessions.page.title") };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function pageHref(page: number): string {
  return page <= 1 ? "/sessions" : `/sessions?page=${page}`;
}

export default async function SessionsPage({ searchParams }: PageProps<"/sessions">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const requested = Number.parseInt(one((await searchParams).page) ?? "1", 10);
  const owner = { userId: user.id, accountId32: user.accountId32 };

  const service = sessionService;
  const [heroes, { timeZone }] = await Promise.all([matchesService.heroMap(), getViewerTimeZone()]);
  const [page, tilt] = await Promise.all([
    service.list(owner, Number.isFinite(requested) ? requested : 1),
    service.tilt(owner).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("sessions.page.kicker")}
        title={t("sessions.page.title")}
        description={t("sessions.page.description")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <GapSelector value={page.gapMinutes} />
        {page.totalSessions > 0 && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("sessions.page.count", {
              sessions: plural(t, "sessions.page.sessions", page.totalSessions),
              matches: plural(t, "sessions.page.matches", page.totalMatches),
            })}
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
          <h2 className="text-lg font-semibold">{t("sessions.page.emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("sessions.page.emptyBody")}</p>
          <Link href="/dashboard" className="text-sm text-gold hover:underline">
            {t("sessions.page.emptyLink")}
          </Link>
        </section>
      ) : (
        <section className="panel overflow-hidden" aria-labelledby="sessions-title">
          <div className="flex items-baseline justify-between gap-3 p-5 pb-3">
            <div>
              <p className="kicker">{t("sessions.page.listKicker")}</p>
              <h2 id="sessions-title" className="text-lg font-semibold">
                {t("sessions.page.listTitle")}
              </h2>
            </div>
            {page.pageCount > 1 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("sessions.page.pageOf", { page: page.page, count: page.pageCount })}
              </span>
            )}
          </div>
          <div className="border-t border-white/[0.06]">
            <SessionList items={page.items} heroes={heroes} timeZone={timeZone} />
          </div>
          <nav
            aria-label={t("sessions.page.pagesNav")}
            className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-sm"
          >
            {page.page > 1 ? (
              <Link
                href={pageHref(page.page - 1)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft aria-hidden className="size-4" /> {t("sessions.page.newer")}
              </Link>
            ) : (
              <span />
            )}
            {page.page < page.pageCount && (
              <Link
                href={pageHref(page.page + 1)}
                className="inline-flex items-center gap-1 font-medium text-gold hover:underline"
              >
                {t("sessions.page.older")} <ChevronRight aria-hidden className="size-4" />
              </Link>
            )}
          </nav>
        </section>
      )}

      {page.page === 1 && page.earlierNotes.length > 0 && (
        <section className="panel space-y-3 p-5" aria-labelledby="earlier-notes-title">
          <div>
            <p className="kicker">{t("sessions.page.earlierKicker")}</p>
            <h2 id="earlier-notes-title" className="text-lg font-semibold">
              {t("sessions.page.earlierTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("sessions.page.earlierBody")}</p>
          </div>
          <EarlierNotes items={page.earlierNotes} timeZone={timeZone} />
        </section>
      )}

      <p className="flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>
          {t("sessions.page.footnote", {
            n: ESTIMATE_PER_GAME,
            zone: timeZone === "UTC" ? "UTC" : t("sessions.page.yourZone"),
          })}
        </span>
      </p>
    </div>
  );
}
