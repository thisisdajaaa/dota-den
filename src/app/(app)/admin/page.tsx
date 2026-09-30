import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { adminTotals } from "@/modules/admin/domain/overview";
import { getRoomDraftCounts } from "@/modules/drafts/composition";
import { getAdminUserRows, getCurrentUser } from "@/modules/identity/composition";
import { getRecentJobFailures } from "@/modules/jobs/composition";
import { getActivityCounts } from "@/modules/leaderboards/composition";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { getMatchStatsByAccount } from "@/modules/matches/composition";
import { formatAgo } from "@/modules/matches/ui/format";
import { RankMedal, rankLabel } from "@/modules/matches/ui/rank-medal";
import { getMmrEntryCounts } from "@/modules/mmr/composition";
import { getPublicProfile } from "@/modules/players/composition";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";

export const metadata: Metadata = { title: "Admin" };

const date = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** Admins only: who uses Dota Den and how. Everyone else gets a 404. */
export default async function AdminPage() {
  const viewer = await getCurrentUser();
  if (!viewer?.roles.includes("admin")) notFound();

  const users = await getAdminUserRows();
  const userIds = users.map((u) => u.userId);
  const accountIds = users.map((u) => u.accountId32);
  const [matches, mmr, activity, rooms, failures, profiles] = await Promise.all([
    getMatchStatsByAccount(accountIds),
    getMmrEntryCounts(userIds),
    getActivityCounts(userIds),
    getRoomDraftCounts(userIds),
    getRecentJobFailures().catch(() => []),
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
