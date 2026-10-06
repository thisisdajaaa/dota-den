import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { adminTotals } from "@/modules/admin/domain/overview";
import { getRoomDraftCounts } from "@/modules/drafts/composition";
import { getAdminUserRows, getCurrentUser } from "@/modules/identity/composition";
import { errorsService } from "@/modules/errors";
import { getCronRuns, getRecentJobFailures } from "@/modules/jobs/composition";
import { getActivityCounts } from "@/modules/leaderboards/composition";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { getMatchStatsByAccount } from "@/modules/matches/composition";
import { formatAgo } from "@/modules/matches/ui/format";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { getMmrEntryCounts } from "@/modules/mmr/composition";
import { getPublicProfile } from "@/modules/players/composition";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { RunSyncButton } from "./run-sync-button";

export const metadata: Metadata = { title: "Admin" };
// The "Run match sync now" action runs here and can take most of a minute.
export const maxDuration = 60;

const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** Admins only: who uses Dota Den and how. Everyone else gets a 404. */
export default async function AdminPage() {
  const viewer = await getCurrentUser();
  if (!viewer?.roles.includes("admin")) notFound();

  const users = await getAdminUserRows();
  const userIds = users.map((u) => u.userId);
  const accountIds = users.map((u) => u.accountId32);
  const [matches, mmr, activity, rooms, failures, errors, cronRuns, profiles] = await Promise.all([
    getMatchStatsByAccount(accountIds),
    getMmrEntryCounts(userIds),
    getActivityCounts(userIds),
    getRoomDraftCounts(userIds),
    getRecentJobFailures().catch(() => []),
    errorsService.recentGroups(7).catch(() => null),
    getCronRuns(10).catch(() => null),
    Promise.all(accountIds.map((id) => getPublicProfile(id).catch(() => null))),
  ]);
  const now = new Date();
  const rows = users
    .map((u, i) => ({
      ...u,
      profile: profiles[i],
      stats: matches.get(u.accountId32),
      mmrEntries: mmr.get(u.userId) ?? 0,
      drafts: activity.get(u.userId)?.drafts ?? 0,
      challenges: activity.get(u.userId)?.challenges ?? 0,
      roomDrafts: rooms.get(u.userId) ?? 0,
    }))
    .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0));
  const totals = adminTotals(
    rows.map((r) => ({
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      matches: r.stats?.matches ?? 0,
      profileVisibility: r.profileVisibility,
    })),
    now,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin"
        title="Users and activity"
        description="Everyone who has signed in (production and staging share this database). Names and ranks come from their public OpenDota profiles."
      />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="Users" value={String(totals.users)} />
        <StatTile label="New this week" value={String(totals.newThisWeek)} />
        <StatTile label="Active today" value={String(totals.activeToday)} />
        <StatTile label="Active this week" value={String(totals.activeThisWeek)} />
        <StatTile
          label="With matches"
          value={String(totals.withMatches)}
          detail="public history imported"
        />
        <StatTile label="On public boards" value={String(totals.listedPublicly)} />
      </section>

      <section aria-labelledby="admin-users" className="panel overflow-hidden">
        <h2 id="admin-users" className="px-5 pt-5 text-lg font-semibold">
          Users
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Every user, most recently active first</caption>
            <thead>
              <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                <th className="px-5 py-2 font-medium">Player</th>
                <th className="py-2 font-medium">Joined (UTC)</th>
                <th className="py-2 font-medium">Last seen</th>
                <th className="py-2 text-right font-medium">Matches</th>
                <th className="py-2 text-right font-medium">MMR entries</th>
                <th className="py-2 text-right font-medium">Drafts</th>
                <th className="py-2 text-right font-medium">Room drafts</th>
                <th className="py-2 text-right font-medium">Challenges</th>
                <th className="px-5 py-2 font-medium">Profile</th>
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
                            {rank ? rankLabel(rank) : "Unranked"} · {r.accountId32}
                            {r.isAdmin && <span className="text-gold"> · admin</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums">{date(r.createdAt)}</td>
                    <td className="py-2.5">
                      {r.lastSeenAt ? (
                        formatAgo(r.lastSeenAt, now)
                      ) : (
                        <span className="text-muted-foreground">signed out</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {r.sessions} device{r.sessions === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {(r.stats?.matches ?? 0).toLocaleString("en-US")}
                      <span className="block text-xs text-muted-foreground">
                        {r.stats?.lastSyncAt
                          ? r.stats.backfillComplete
                            ? `synced ${formatAgo(r.stats.lastSyncAt, now)}`
                            : "importing"
                          : "never synced"}
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
            Daily jobs
          </h2>
          <p className="text-sm text-muted-foreground">
            The match sync runs every day at 14:30 (Philippine time) and the patch import at 14:00.
            A run that started but never finished was cut off (Vercel stops it at 60s).
          </p>
        </div>
        <RunSyncButton />
        {cronRuns === null ? (
          <p className="text-sm text-muted-foreground">Unavailable right now.</p>
        ) : cronRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded runs yet.</p>
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
                      ? `${sum.synced ?? 0} synced · ${sum.backfilling ?? 0} importing · ${failed} failed · ${Math.round(Number(sum.durationMs ?? 0) / 1000)}s`
                      : r.ok === false
                        ? `Failed: ${String(sum.error ?? "unknown")}`
                        : r.finishedAt === null && now.getTime() - r.startedAt.getTime() > 120_000
                          ? "Started but never finished (cut off)"
                          : "Running…"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-errors" className="panel overflow-hidden">
        <div className="p-5 pb-3">
          <h2 id="admin-errors" className="text-lg font-semibold">
            Recent errors
          </h2>
          <p className="text-sm text-muted-foreground">
            Errors users hit in the last 7 days, grouped. Server errors come from page renders and
            API routes; browser errors from the app&apos;s error pages. Kept for 30 days.
          </p>
        </div>
        {errors === null ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Unavailable right now.</p>
        ) : errors.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">None.</p>
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
                    {e.route ?? e.path ?? "unknown page"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.count}× · last {formatAgo(e.lastAt, now)}
                    {e.count > 1 ? ` · first ${formatAgo(e.firstAt, now)}` : ""}
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
          Recent failed background jobs
        </h2>
        {failures.length === 0 ? (
          <p className="text-sm text-muted-foreground">None in the last 14 days.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {failures.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}</span>{" "}
                <span className="text-muted-foreground">{formatAgo(f.at, now)}</span>:{" "}
                {f.error ?? "unknown error"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
