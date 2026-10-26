import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { adminService } from "@/modules/admin";
import { plusService } from "@/modules/plus";
import { getCurrentUser } from "@/modules/identity";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { formatAgo } from "@/modules/matches/ui/format";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { RunSyncButton } from "./run-sync-button";
import { SchedulesButton } from "./schedules-button";
import { TestAlertButton } from "./test-alert-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("admin.title") };
}
// The "Run match sync now" action runs here and can take most of a minute.
export const maxDuration = 60;

const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

type Tone = "ok" | "warn" | "bad" | "muted";
const TONE: Record<Tone, string> = {
  ok: "bg-win",
  warn: "bg-gold",
  bad: "bg-loss",
  muted: "bg-unknown",
};

/** Admins only: who uses Dota Den and how, and whether anything needs fixing. */
export default async function AdminPage() {
  const viewer = await getCurrentUser();
  if (!viewer?.roles.includes("admin")) notFound();
  const t = await getT();

  const now = new Date();
  const {
    totals,
    retention,
    optIns,
    usage,
    parseRate,
    users: rows,
    jobFailures: failures,
    errors,
    cronRuns,
    alerts,
    opsReports,
  } = await adminService.overview(now);
  const plus = await plusService.adminCounts().catch(() => null);

  // At a glance: the newest run of each daily job, real alerts, error groups, failed jobs.
  const latestRuns = cronRuns
    ? [...new Map([...cronRuns].reverse().map((r) => [r.name, r])).values()]
    : null;
  const failedRuns = latestRuns?.filter((r) => r.ok === false).length ?? 0;
  const realAlerts = alerts?.filter((a) => a.kind !== "test") ?? null;
  const errorCount = errors?.reduce((n, e) => n + e.count, 0) ?? null;
  const health: { href: string; label: string; value: string; tone: Tone }[] = [
    {
      href: "#admin-cron",
      label: t("admin.health.jobs"),
      ...(latestRuns === null
        ? { value: t("admin.health.unknown"), tone: "muted" as const }
        : latestRuns.length === 0
          ? { value: t("admin.health.noRuns"), tone: "muted" as const }
          : failedRuns > 0
            ? { value: plural(t, "admin.health.failed", failedRuns), tone: "bad" as const }
            : { value: t("admin.health.ok"), tone: "ok" as const }),
    },
    {
      href: "#alerts",
      label: t("admin.health.alerts"),
      ...(realAlerts === null
        ? { value: t("admin.health.unknown"), tone: "muted" as const }
        : {
            value: realAlerts.length
              ? plural(t, "admin.health.alerts30", realAlerts.length)
              : t("admin.health.none"),
            tone: realAlerts.length ? ("warn" as const) : ("ok" as const),
          }),
    },
    {
      href: "#admin-errors",
      label: t("admin.health.errors"),
      ...(errorCount === null
        ? { value: t("admin.health.unknown"), tone: "muted" as const }
        : {
            value: errorCount
              ? plural(t, "admin.health.errors7", errorCount)
              : t("admin.health.none"),
            tone: errorCount ? ("bad" as const) : ("ok" as const),
          }),
    },
    {
      href: "#admin-jobs",
      label: t("admin.health.background"),
      value: failures.length
        ? plural(t, "admin.health.failed14", failures.length)
        : t("admin.health.none"),
      tone: failures.length ? "bad" : "ok",
    },
    {
      href: "#admin-plus",
      label: t("plus.admin.title"),
      ...(!plus
        ? { value: t("admin.health.unknown"), tone: "muted" as const }
        : !plus.configured
          ? { value: t("admin.health.plusOff"), tone: "muted" as const }
          : !plus.enabled
            ? { value: t("admin.health.plusPaused"), tone: "warn" as const }
            : {
                value: plural(t, "admin.health.plusOn", plus.entitled),
                tone: "ok" as const,
              }),
    },
  ];

  const metrics: { label: string; value: string; detail?: string }[] = [
    { label: t("admin.totals.users"), value: String(totals.users) },
    { label: t("admin.totals.newThisWeek"), value: String(totals.newThisWeek) },
    { label: t("admin.totals.activeToday"), value: String(totals.activeToday) },
    {
      label: t("admin.retention.active7"),
      value: String(retention?.active7 ?? totals.activeThisWeek),
    },
    { label: t("admin.retention.active30"), value: retention ? String(retention.active30) : "–" },
    {
      label: t("admin.retention.returning"),
      value: retention ? String(retention.returning) : "–",
      detail: plural(t, "admin.retention.ofUsers", totals.users),
    },
    {
      label: t("admin.totals.withMatches"),
      value: String(totals.withMatches),
      detail: t("admin.totals.withMatchesDetail"),
    },
    { label: t("admin.totals.listedPublicly"), value: String(totals.listedPublicly) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        kicker={t("admin.kicker")}
        title={t("admin.heading")}
        description={t("admin.description")}
      />

      <nav aria-label={t("admin.health.aria")} className="flex flex-wrap gap-2">
        {health.map((h) => (
          <a
            key={h.href}
            href={h.href}
            className="flex min-h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm hover:border-gold/40"
          >
            <span aria-hidden className={cn("size-2 rounded-full", TONE[h.tone])} />
            <span className="text-muted-foreground">{h.label}</span>
            <span className="font-medium">{h.value}</span>
          </a>
        ))}
      </nav>

      <section aria-label={t("admin.totals.aria")} className="panel overflow-hidden">
        {/* 1px gaps over a lighter background draw the hairlines between cells at any width. */}
        <div className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4 xl:grid-cols-8">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1 bg-card p-4">
              <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {m.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{m.value}</p>
              {m.detail && <p className="text-xs text-muted-foreground">{m.detail}</p>}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-users" className="panel overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id="admin-users" className="text-lg font-semibold">
            {t("admin.users.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("admin.users.caption")}</p>
        </div>

        {/* Phones: one card per player. */}
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06] md:hidden">
          {rows.map((r) => {
            const rank = parseRankTier(r.profile?.rankTier, r.profile?.leaderboardRank);
            const name = displayName(r.profile?.personaName ?? null, r.accountId32);
            return (
              <li key={r.userId} className="space-y-3 px-5 py-4">
                <PlayerCell
                  name={name}
                  accountId32={r.accountId32}
                  avatarUrl={r.profile?.avatarUrl ?? null}
                  rank={rank}
                  isAdmin={r.isAdmin}
                  t={t}
                />
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                  <Fact label={t("admin.users.lastSeen")}>
                    {r.lastSeenAt ? formatAgo(r.lastSeenAt, now) : t("admin.users.signedOut")}
                  </Fact>
                  <Fact label={t("admin.users.matches")}>
                    {(r.stats?.matches ?? 0).toLocaleString("en-US")}
                  </Fact>
                  <Fact label={t("admin.users.mmrEntries")}>{r.mmrEntries}</Fact>
                  <Fact label={t("admin.users.drafts")}>{r.drafts + r.roomDrafts}</Fact>
                  <Fact label={t("admin.users.challenges")}>{r.challenges}</Fact>
                  <Fact label={t("admin.users.joined")}>
                    {r.createdAt.toISOString().slice(0, 10)}
                  </Fact>
                </dl>
              </li>
            );
          })}
        </ul>

        {/* Wider screens: the full table. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[50rem] text-sm">
            <caption className="sr-only">{t("admin.users.caption")}</caption>
            <thead>
              <tr className="border-t border-white/[0.06] text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                <th className="px-5 py-2 font-medium">{t("admin.users.player")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.lastSeen")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin.users.matches")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin.users.mmrEntries")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin.users.drafts")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin.users.roomDrafts")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("admin.users.challenges")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.joined")}</th>
                <th className="px-5 py-2 font-medium">{t("admin.users.profile")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rank = parseRankTier(r.profile?.rankTier, r.profile?.leaderboardRank);
                const name = displayName(r.profile?.personaName ?? null, r.accountId32);
                return (
                  <tr
                    key={r.userId}
                    className="border-t border-white/[0.05] align-middle hover:bg-white/[0.02]"
                  >
                    <td className="max-w-[18rem] px-5 py-2.5">
                      <PlayerCell
                        name={name}
                        accountId32={r.accountId32}
                        avatarUrl={r.profile?.avatarUrl ?? null}
                        rank={rank}
                        isAdmin={r.isAdmin}
                        t={t}
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.lastSeenAt ? (
                        formatAgo(r.lastSeenAt, now)
                      ) : (
                        <span className="text-muted-foreground">{t("admin.users.signedOut")}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {plural(t, "admin.users.devices", r.sessions)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {(r.stats?.matches ?? 0).toLocaleString("en-US")}
                      <span className="block text-xs text-muted-foreground">
                        {r.stats?.lastSyncAt
                          ? r.stats.backfillComplete
                            ? t("admin.users.synced", {
                                ago: formatAgo(r.stats.lastSyncAt, now),
                              })
                            : t("admin.users.importing")
                          : t("admin.users.neverSynced")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.mmrEntries}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.drafts}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.roomDrafts}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.challenges}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                      {date(r.createdAt)}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-muted-foreground capitalize">
                      {r.profileVisibility}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="admin-retention" className="panel space-y-4 p-5">
            <div>
              <h2 id="admin-retention" className="text-lg font-semibold">
                {t("admin.retention.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("admin.retention.definition")}</p>
            </div>
            {retention ? (
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t("admin.retention.caption")}</caption>
                    <thead>
                      <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                        <th className="py-2 pr-4 font-medium">{t("admin.retention.week")}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("admin.retention.signedUp")}
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("admin.retention.within7")}
                        </th>
                        <th className="py-2 pl-3 text-right font-medium">
                          {t("admin.retention.ever")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {retention.weeks.map((w) => (
                        <tr key={w.week} className="border-t border-white/[0.05]">
                          <td className="py-2 pr-4 whitespace-nowrap tabular-nums">{w.week}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{w.signedUp}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <Share n={w.returnedWithin7} of={w.signedUp} />
                          </td>
                          <td className="py-2 pl-3 text-right tabular-nums">
                            <Share n={w.returnedEver} of={w.signedUp} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 md:w-52">
                  <h3 className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    {t("admin.retention.reach")}
                  </h3>
                  <dl className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                    {(
                      [
                        ["notifications", optIns.notifications],
                        ["email", optIns.email],
                        ["discord", optIns.discord],
                      ] as const
                    ).map(([key, n]) => (
                      <div
                        key={key}
                        className="flex items-baseline justify-between gap-3 px-3 py-2"
                      >
                        <dt>
                          {t(`admin.retention.${key}`)}
                          <span className="block text-xs text-muted-foreground">
                            {t(`admin.retention.${key}Detail`)}
                          </span>
                        </dt>
                        <dd className="text-lg font-semibold tabular-nums">
                          {n === null ? "–" : n}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.retention.unavailable")}</p>
            )}
          </section>

          <section aria-labelledby="admin-usage" className="panel space-y-4 p-5">
            <div>
              <h2 id="admin-usage" className="text-lg font-semibold">
                {t("admin.usage.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("admin.usage.definition")}</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] px-3 py-2 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>{t("admin.usage.parseRate")}</span>
                <span className="text-lg font-semibold tabular-nums">
                  {parseRate === null ? "–" : <Share n={parseRate.parsed} of={parseRate.games} />}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {parseRate === null
                  ? t("admin.usage.unavailable")
                  : t("admin.usage.parseRateDetail", {
                      games: parseRate.games,
                      days: parseRate.windowDays,
                    })}
              </p>
            </div>
            {usage ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("admin.usage.caption")}</caption>
                  <thead>
                    <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                      <th className="py-2 pr-4 font-medium">{t("admin.usage.feature")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("admin.usage.last7")}</th>
                      <th className="py-2 pl-3 text-right font-medium">
                        {t("admin.usage.last30")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.map((u) => (
                      <tr key={u.feature} className="border-t border-white/[0.05]">
                        <td className="py-2 pr-4">{t(`admin.usage.features.${u.feature}`)}</td>
                        {[u.last7, u.last30].map((w, i) => (
                          <td
                            key={i}
                            className={cn(
                              "py-2 text-right whitespace-nowrap tabular-nums",
                              i === 0 ? "px-3" : "pl-3",
                              w.uses === 0 && "text-muted-foreground",
                            )}
                          >
                            {w.uses}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {plural(t, "admin.usage.players", w.players)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.usage.unavailable")}</p>
            )}
          </section>

          <section aria-labelledby="admin-errors" className="panel scroll-mt-20 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 id="admin-errors" className="text-lg font-semibold">
                {t("admin.errors.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("admin.errors.body")}</p>
            </div>
            {errors === null ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                {t("admin.errors.unavailable")}
              </p>
            ) : errors.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">{t("admin.errors.none")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
                {errors.map((e) => (
                  <li key={e.fingerprint} className="px-5 py-3 text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase",
                          e.source === "server" ? "bg-loss/15 text-loss" : "bg-gold/15 text-gold",
                        )}
                      >
                        {e.source}
                      </span>
                      <span className="font-medium break-all">
                        {e.route ?? e.path ?? t("admin.errors.unknownPage")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {e.count}× · {t("admin.errors.last", { ago: formatAgo(e.lastAt, now) })}
                        {e.count > 1
                          ? ` · ${t("admin.errors.first", { ago: formatAgo(e.firstAt, now) })}`
                          : ""}
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
                      {e.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          {plus && (
            <section aria-labelledby="admin-plus" className="panel scroll-mt-20 space-y-3 p-5">
              <div>
                <h2 id="admin-plus" className="text-base font-semibold">
                  {t("plus.admin.title")}
                </h2>
                {!plus.configured ? (
                  <p className="text-xs text-muted-foreground">{t("plus.admin.off")}</p>
                ) : (
                  !plus.enabled && (
                    <p className="text-xs text-muted-foreground">{t("plus.admin.disabled")}</p>
                  )
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/[0.06] p-3">
                  <dt className="text-xs text-muted-foreground">{t("plus.admin.entitled")}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{plus.entitled}</dd>
                </div>
                <div className="rounded-lg border border-white/[0.06] p-3">
                  <dt className="text-xs text-muted-foreground">{t("plus.admin.unlinked")}</dt>
                  <dd
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      plus.unlinked > 0 && "text-loss",
                    )}
                  >
                    {plus.unlinked}
                  </dd>
                </div>
              </dl>
              {plus.unlinked > 0 && (
                <p className="text-xs text-muted-foreground">{t("plus.admin.unlinkedDetail")}</p>
              )}
              {plus.byStatus.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("plus.admin.none")}</p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("plus.admin.caption")}</caption>
                  <thead>
                    <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                      <th className="py-1.5 font-medium">{t("plus.admin.status")}</th>
                      <th className="py-1.5 text-right font-medium">{t("plus.admin.count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plus.byStatus.map((r) => (
                      <tr key={r.status} className="border-t border-white/[0.05]">
                        <td className="py-1.5">{t(`plus.card.status.${r.status}`)}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          <section aria-labelledby="admin-cron" className="panel scroll-mt-20 space-y-3 p-5">
            <div>
              <h2 id="admin-cron" className="text-base font-semibold">
                {t("admin.cron.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("admin.cron.body")}</p>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <RunSyncButton />
              <SchedulesButton />
            </div>
            {cronRuns === null ? (
              <p className="text-sm text-muted-foreground">{t("admin.cron.unavailable")}</p>
            ) : cronRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.cron.empty")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                {cronRuns.map((r) => {
                  const sum = (r.summary ?? {}) as Record<string, unknown>;
                  const failed = Array.isArray(sum.failed) ? sum.failed.length : 0;
                  const cutOff =
                    r.ok === null &&
                    r.finishedAt === null &&
                    now.getTime() - r.startedAt.getTime() > 120_000;
                  const tone: Tone =
                    r.ok === true ? "ok" : r.ok === false || cutOff ? "bad" : "warn";
                  return (
                    <li key={r.id} className="flex gap-2.5 px-3 py-2">
                      <span
                        aria-hidden
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[tone])}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.trigger} · {formatAgo(r.startedAt, now)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "block text-xs break-words",
                            tone === "bad" ? "text-loss" : "text-muted-foreground",
                          )}
                        >
                          {r.ok === true
                            ? t("admin.cron.ok", {
                                synced: String(sum.synced ?? 0),
                                importing: String(sum.backfilling ?? 0),
                                failed,
                                seconds: Math.round(Number(sum.durationMs ?? 0) / 1000),
                              })
                            : r.ok === false
                              ? t("admin.cron.failed", {
                                  error: String(sum.error ?? t("admin.cron.unknown")),
                                })
                              : cutOff
                                ? t("admin.cron.cutOff")
                                : t("admin.cron.running")}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="admin-alerts"
            id="alerts"
            className="panel scroll-mt-20 space-y-4 p-5"
          >
            <div>
              <h2 id="admin-alerts" className="text-base font-semibold">
                {t("admin.alerts.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("admin.alerts.body")}</p>
            </div>
            <TestAlertButton />
            <div className="space-y-2">
              <h3 className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("admin.alerts.recent")}
              </h3>
              {alerts === null ? (
                <p className="text-sm text-muted-foreground">{t("admin.alerts.unavailable")}</p>
              ) : alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.alerts.none")}</p>
              ) : (
                <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                  {alerts.map((a) => (
                    <li key={a.id} className="space-y-0.5 px-3 py-2">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span
                          className={cn(
                            "font-medium",
                            a.kind === "test" ? "text-foreground" : "text-loss",
                          )}
                        >
                          {t(`admin.alerts.messages.${a.kind}.title`, a.vars)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatAgo(a.at, now)}
                        </span>
                      </p>
                      <p className="text-xs break-words text-muted-foreground">
                        {t(`admin.alerts.messages.${a.kind}.body`, a.vars)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("admin.alerts.delivered", {
                          devices: plural(t, "common.count.devices", a.devices),
                          webhook: t(`admin.alerts.webhook.${a.webhook}`),
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {t("admin.alerts.reports")}
              </h3>
              {opsReports === null ? (
                <p className="text-sm text-muted-foreground">{t("admin.alerts.unavailable")}</p>
              ) : opsReports.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.alerts.reportsNone")}</p>
              ) : (
                <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                  {opsReports.map((r) => (
                    <li key={r.id} className="flex gap-2.5 px-3 py-2">
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          r.ok ? "bg-win" : "bg-loss",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">
                            {r.job === "backup"
                              ? t("admin.alerts.jobs.backup")
                              : t("admin.alerts.jobs.restoreDrill")}
                          </span>
                          <span className={cn("text-xs", r.ok ? "text-win" : "text-loss")}>
                            {r.ok ? t("admin.alerts.ok") : t("admin.alerts.failed")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatAgo(r.at, now)}
                          </span>
                          {r.runUrl && (
                            <a
                              href={r.runUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-gold hover:underline"
                            >
                              {t("admin.alerts.viewRun")}
                            </a>
                          )}
                        </span>
                        {r.details && (
                          <span className="block font-mono text-xs break-words text-muted-foreground">
                            {r.details}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="admin-jobs" className="panel scroll-mt-20 space-y-2 p-5">
            <h2 id="admin-jobs" className="text-base font-semibold">
              {t("admin.jobs.title")}
            </h2>
            {failures.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.jobs.none")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                {failures.map((f, i) => (
                  <li key={i} className="px-3 py-2">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{formatAgo(f.at, now)}</span>
                    </span>
                    <span className="block text-xs break-words text-loss">
                      {f.error ?? t("admin.jobs.unknownError")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getT>>;

/** Avatar, name (linked) with an admin chip, and rank · account id underneath. */
function PlayerCell({
  name,
  accountId32,
  avatarUrl,
  rank,
  isAdmin,
  t,
}: {
  name: string;
  accountId32: number;
  avatarUrl: string | null;
  rank: ReturnType<typeof parseRankTier>;
  isAdmin: boolean;
  t: T;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <PlayerAvatar url={avatarUrl} name={name} size="sm" />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link
            href={`/players/${accountId32}`}
            className="truncate font-medium hover:text-gold touch:-my-2 touch:py-2"
          >
            {name}
          </Link>
          {isAdmin && (
            <span className="shrink-0 rounded bg-gold/15 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-gold uppercase">
              {t("admin.users.admin")}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
          {rank && <RankMedal rank={rank} size={14} />}
          {rank ? rankLabel(rank) : t("admin.users.unranked")}
          <span aria-hidden>·</span>
          <span className="tabular-nums">{accountId32}</span>
        </span>
      </span>
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.65rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="truncate tabular-nums">{children}</dd>
    </div>
  );
}

/** "3 (60%)": a count with its share of the week's sign-ups. */
function Share({ n, of }: { n: number; of: number }) {
  return (
    <>
      {n}
      {of > 0 && (
        <span className="ml-1 text-xs text-muted-foreground">({Math.round((n / of) * 100)}%)</span>
      )}
    </>
  );
}
