import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
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
import { TestAlertButton } from "./test-alert-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("admin.title") };
}
// The "Run match sync now" action runs here and can take most of a minute.
export const maxDuration = 60;

const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** Admins only: who uses Dota Den and how. Everyone else gets a 404. */
export default async function AdminPage() {
  const viewer = await getCurrentUser();
  if (!viewer?.roles.includes("admin")) notFound();
  const t = await getT();

  const now = new Date();
  const {
    totals,
    retention,
    optIns,
    users: rows,
    jobFailures: failures,
    errors,
    cronRuns,
    alerts,
    opsReports,
  } = await adminService.overview(now);
  const plus = await plusService.adminCounts().catch(() => null);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("admin.kicker")}
        title={t("admin.heading")}
        description={t("admin.description")}
      />

      <section
        aria-label={t("admin.totals.aria")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-6"
      >
        <StatTile label={t("admin.totals.users")} value={String(totals.users)} />
        <StatTile label={t("admin.totals.newThisWeek")} value={String(totals.newThisWeek)} />
        <StatTile label={t("admin.totals.activeToday")} value={String(totals.activeToday)} />
        <StatTile label={t("admin.totals.activeThisWeek")} value={String(totals.activeThisWeek)} />
        <StatTile
          label={t("admin.totals.withMatches")}
          value={String(totals.withMatches)}
          detail={t("admin.totals.withMatchesDetail")}
        />
        <StatTile label={t("admin.totals.listedPublicly")} value={String(totals.listedPublicly)} />
      </section>

      <section aria-labelledby="admin-retention" className="panel space-y-4 p-5">
        <div>
          <h2 id="admin-retention" className="text-lg font-semibold">
            {t("admin.retention.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("admin.retention.definition")}</p>
        </div>
        {retention ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
              <StatTile label={t("admin.retention.active1")} value={String(retention.active1)} />
              <StatTile label={t("admin.retention.active7")} value={String(retention.active7)} />
              <StatTile label={t("admin.retention.active30")} value={String(retention.active30)} />
              <StatTile
                label={t("admin.retention.returning")}
                value={`${retention.returning} / ${totals.users}`}
                detail={t("admin.retention.returningDetail")}
              />
              <StatTile
                label={t("admin.retention.notifications")}
                value={optIns.notifications === null ? "–" : String(optIns.notifications)}
                detail={t("admin.retention.notificationsDetail")}
              />
              <StatTile
                label={t("admin.retention.email")}
                value={optIns.email === null ? "–" : String(optIns.email)}
                detail={t("admin.retention.emailDetail")}
              />
              <StatTile
                label={t("admin.retention.discord")}
                value={optIns.discord === null ? "–" : String(optIns.discord)}
                detail={t("admin.retention.discordDetail")}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="sr-only">{t("admin.retention.caption")}</caption>
                <thead>
                  <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                    <th className="py-2 font-medium">{t("admin.retention.week")}</th>
                    <th className="py-2 text-right font-medium">{t("admin.retention.signedUp")}</th>
                    <th className="py-2 text-right font-medium">{t("admin.retention.within7")}</th>
                    <th className="py-2 text-right font-medium">{t("admin.retention.ever")}</th>
                  </tr>
                </thead>
                <tbody>
                  {retention.weeks.map((w) => (
                    <tr key={w.week} className="border-t border-border/50">
                      <td className="py-2 tabular-nums">{w.week}</td>
                      <td className="py-2 text-right tabular-nums">{w.signedUp}</td>
                      <td className="py-2 text-right tabular-nums">{w.returnedWithin7}</td>
                      <td className="py-2 text-right tabular-nums">{w.returnedEver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.retention.unavailable")}</p>
        )}
      </section>

      {plus && (
        <section aria-labelledby="admin-plus" className="panel space-y-4 p-5">
          <div>
            <h2 id="admin-plus" className="text-lg font-semibold">
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatTile label={t("plus.admin.entitled")} value={String(plus.entitled)} />
            <StatTile
              label={t("plus.admin.unlinked")}
              value={String(plus.unlinked)}
              detail={t("plus.admin.unlinkedDetail")}
            />
          </div>
          {plus.byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("plus.admin.none")}</p>
          ) : (
            <table className="w-full max-w-md text-sm">
              <caption className="sr-only">{t("plus.admin.caption")}</caption>
              <thead>
                <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 font-medium">{t("plus.admin.status")}</th>
                  <th className="py-2 text-right font-medium">{t("plus.admin.count")}</th>
                </tr>
              </thead>
              <tbody>
                {plus.byStatus.map((r) => (
                  <tr key={r.status} className="border-t border-border/50">
                    <td className="py-2">{t(`plus.card.status.${r.status}`)}</td>
                    <td className="py-2 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section aria-labelledby="admin-users" className="panel overflow-hidden">
        <h2 id="admin-users" className="px-5 pt-5 text-lg font-semibold">
          {t("admin.users.title")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">{t("admin.users.caption")}</caption>
            <thead>
              <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                <th className="px-5 py-2 font-medium">{t("admin.users.player")}</th>
                <th className="py-2 font-medium">{t("admin.users.joined")}</th>
                <th className="py-2 font-medium">{t("admin.users.lastSeen")}</th>
                <th className="py-2 text-right font-medium">{t("admin.users.matches")}</th>
                <th className="py-2 text-right font-medium">{t("admin.users.mmrEntries")}</th>
                <th className="py-2 text-right font-medium">{t("admin.users.drafts")}</th>
                <th className="py-2 text-right font-medium">{t("admin.users.roomDrafts")}</th>
                <th className="py-2 text-right font-medium">{t("admin.users.challenges")}</th>
                <th className="px-5 py-2 font-medium">{t("admin.users.profile")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rank = parseRankTier(r.profile?.rankTier, r.profile?.leaderboardRank);
                const name = displayName(r.profile?.personaName ?? null, r.accountId32);
                return (
                  <tr key={r.userId} className="border-t border-white/[0.05] align-middle">
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <PlayerAvatar url={r.profile?.avatarUrl ?? null} name={name} size="sm" />
                        <span className="min-w-0">
                          <Link
                            href={`/players/${r.accountId32}`}
                            className="block truncate font-medium hover:text-gold"
                          >
                            {name}
                          </Link>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {rank && <RankMedal rank={rank} size={16} />}
                            {rank ? rankLabel(rank) : t("admin.users.unranked")} · {r.accountId32}
                            {r.isAdmin && (
                              <span className="text-gold"> · {t("admin.users.admin")}</span>
                            )}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums">{date(r.createdAt)}</td>
                    <td className="py-2.5">
                      {r.lastSeenAt ? (
                        formatAgo(r.lastSeenAt, now)
                      ) : (
                        <span className="text-muted-foreground">{t("admin.users.signedOut")}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {plural(t, "admin.users.devices", r.sessions)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {(r.stats?.matches ?? 0).toLocaleString("en-US")}
                      <span className="block text-xs text-muted-foreground">
                        {r.stats?.lastSyncAt
                          ? r.stats.backfillComplete
                            ? t("admin.users.synced", { ago: formatAgo(r.stats.lastSyncAt, now) })
                            : t("admin.users.importing")
                          : t("admin.users.neverSynced")}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{r.mmrEntries}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.drafts}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.roomDrafts}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.challenges}</td>
                    <td className="px-5 py-2.5 text-xs capitalize">{r.profileVisibility}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="admin-cron" className="panel space-y-3 p-5">
        <div>
          <h2 id="admin-cron" className="text-lg font-semibold">
            {t("admin.cron.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.cron.body")}</p>
        </div>
        <RunSyncButton />
        {cronRuns === null ? (
          <p className="text-sm text-muted-foreground">{t("admin.cron.unavailable")}</p>
        ) : cronRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.cron.empty")}</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
            {cronRuns.map((r) => {
              const sum = (r.summary ?? {}) as Record<string, unknown>;
              const failed = Array.isArray(sum.failed) ? sum.failed.length : 0;
              return (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.trigger} · {formatAgo(r.startedAt, now)}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      r.ok === true ? "text-win" : r.ok === false ? "text-loss" : "text-gold",
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
                        : r.finishedAt === null && now.getTime() - r.startedAt.getTime() > 120_000
                          ? t("admin.cron.cutOff")
                          : t("admin.cron.running")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-alerts" id="alerts" className="panel space-y-4 p-5">
        <div>
          <h2 id="admin-alerts" className="text-lg font-semibold">
            {t("admin.alerts.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.alerts.body")}</p>
        </div>
        <TestAlertButton />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("admin.alerts.recent")}</h3>
            {alerts === null ? (
              <p className="text-sm text-muted-foreground">{t("admin.alerts.unavailable")}</p>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.alerts.none")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                {alerts.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span
                        className={cn(
                          "font-medium",
                          a.kind === "test" ? "text-foreground" : "text-loss",
                        )}
                      >
                        {t(`admin.alerts.messages.${a.kind}.title`, a.vars)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatAgo(a.at, now)}</span>
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
            <h3 className="text-sm font-semibold">{t("admin.alerts.reports")}</h3>
            {opsReports === null ? (
              <p className="text-sm text-muted-foreground">{t("admin.alerts.unavailable")}</p>
            ) : opsReports.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin.alerts.reportsNone")}</p>
            ) : (
              <ul className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] text-sm">
                {opsReports.map((r) => (
                  <li key={r.id} className="px-3 py-2">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">
                        {r.job === "backup"
                          ? t("admin.alerts.jobs.backup")
                          : t("admin.alerts.jobs.restoreDrill")}
                      </span>
                      <span className={cn("text-xs", r.ok ? "text-win" : "text-loss")}>
                        {r.ok ? t("admin.alerts.ok") : t("admin.alerts.failed")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {date(r.at)} · {formatAgo(r.at, now)}
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
                    </p>
                    {r.details && (
                      <p className="font-mono text-xs break-words text-muted-foreground">
                        {r.details}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="admin-errors" className="panel overflow-hidden">
        <div className="p-5 pb-3">
          <h2 id="admin-errors" className="text-lg font-semibold">
            {t("admin.errors.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("admin.errors.body")}</p>
        </div>
        {errors === null ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("admin.errors.unavailable")}</p>
        ) : errors.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">{t("admin.errors.none")}</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
            {errors.map((e) => (
              <li key={e.fingerprint} className="px-5 py-3 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
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

      <section aria-labelledby="admin-jobs" className="panel p-5">
        <h2 id="admin-jobs" className="mb-2 text-lg font-semibold">
          {t("admin.jobs.title")}
        </h2>
        {failures.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.jobs.none")}</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {failures.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}</span>{" "}
                <span className="text-muted-foreground">{formatAgo(f.at, now)}</span>:{" "}
                {f.error ?? t("admin.jobs.unknownError")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
