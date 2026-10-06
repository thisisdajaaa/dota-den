import Link from "next/link";
import { Info, Medal, UserPlus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { formatPercent, plural } from "@/modules/matches/ui/format";
import { RankMedal } from "@/modules/matches/ui/rank-medal";
import { PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { BoardView, PlayerView } from "../dtos/responses/leaderboard-views.dto";
import type { BoardKind } from "../domain/ranking";
import { BOARD_LABEL, BOARD_RULES } from "./copy";

const CTA: Record<BoardKind, { href: string; label: string }> = {
  drafts: { href: "/draft", label: "Start a draft" },
  challenges: { href: "/draft/challenges", label: "Try a challenge" },
  rooms: { href: "/draft/rooms/new", label: "Draft with a friend" },
};

interface Stat {
  label: string;
  value: string;
  detail?: string;
  /** Hidden on narrow screens (the first stat always shows). */
  secondary?: boolean;
}

type Row = BoardView["rows"][number];

const score = (n: number | null) => (n === null ? "—" : n.toFixed(1).replace(/\.0$/, ""));

function statsOf(kind: BoardKind, row: Row): Stat[] {
  const s = row.stats as Record<string, unknown>;
  switch (kind) {
    case "drafts": {
      const grade = s.bestGrade as string | null;
      return [
        { label: "Drafts", value: String(s.drafts) },
        {
          label: "Best score",
          value: score(s.bestScore as number | null),
          detail: grade ? `Grade ${grade}` : undefined,
        },
        { label: "Avg score", value: score(s.avgScore as number | null), secondary: true },
      ];
    }
    case "challenges":
      return [
        { label: "Correct", value: String(s.correct) },
        { label: "Best streak", value: String(s.bestStreak) },
        {
          label: "Accuracy",
          value: formatPercent(s.accuracy as number | null),
          detail: `of ${plural(s.answered as number, "answer")}`,
          secondary: true,
        },
      ];
    case "rooms":
      return [
        { label: "Drafts", value: String(s.drafts) },
        { label: "Wins", value: String(s.wins), detail: "self-reported" },
        { label: "Losses", value: String(s.losses), secondary: true },
      ];
  }
}

function PlayerCell({ player }: { player: PlayerView }) {
  const rank = parseRankTier(player.rankTier, player.leaderboardRank);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <PlayerAvatar url={player.avatarUrl} name={player.name} size="sm" />
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <Link
            href={`/players/${player.accountId32}`}
            className="truncate font-medium hover:text-gold hover:underline"
          >
            {player.name}
          </Link>
          {player.isYou && (
            <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[0.65rem] font-semibold text-gold ring-1 ring-gold/40">
              You
            </span>
          )}
        </p>
        {!rank && <p className="text-xs text-muted-foreground">Rank unknown</p>}
      </div>
      {rank && <RankMedal rank={rank} size={36} className="ml-auto sm:ml-0" />}
    </div>
  );
}

function BoardRow({ kind, row }: { kind: BoardKind; row: Row }) {
  const podium = row.rank <= 3;
  return (
    <li
      aria-label={`Rank ${row.rank}: ${row.player.name}${row.player.isYou ? " (you)" : ""}`}
      aria-current={row.player.isYou ? "true" : undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5",
        row.player.isYou && "bg-gold/[0.07] shadow-[inset_2px_0_0_var(--gold)]",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
          podium ? "bg-gold/15 text-gold ring-1 ring-gold/40" : "text-muted-foreground",
        )}
      >
        {row.rank}
      </span>
      <PlayerCell player={row.player} />
      <dl className="ml-12 grid w-full grid-cols-2 gap-x-4 gap-y-1 text-right sm:ml-0 sm:w-auto sm:grid-cols-3">
        {statsOf(kind, row).map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "min-w-[5.5rem] text-left sm:text-right",
              stat.secondary && "hidden sm:block",
            )}
          >
            <dt className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </dt>
            <dd className="font-semibold tabular-nums">
              {stat.value}
              {stat.detail && (
                <span className="block text-[0.65rem] font-normal text-muted-foreground">
                  {stat.detail}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function InviteHint() {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
      <span>
        Invite a friend: create a room at{" "}
        <Link href="/draft/rooms/new" className="text-gold hover:underline">
          /draft/rooms/new
        </Link>{" "}
        and send them the link. Once they sign in and play, they show up here.
      </span>
    </p>
  );
}

function Empty({ title, body, board }: { title: string; body?: string; board: BoardKind }) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <Medal aria-hidden className="size-5" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      <Button asChild size="sm">
        <Link href={CTA[board].href}>{CTA[board].label}</Link>
      </Button>
    </div>
  );
}

/** One leaderboard: ranked rows, your own row highlighted, honest empty states. */
export function LeaderboardBoard({ view }: { view: BoardView }) {
  const { kind, scope, period } = view;
  const when = period === "week" ? " this week" : "";
  const youOnBoard = view.rows.some((r) => r.player.isYou) || view.youBelowCut !== null;
  const othersOnBoard = view.rows.some((r) => !r.player.isYou);
  const noFriendAccounts = scope === "friends" && view.friendsWithAccounts === 0;

  let empty: { title: string; body?: string } | null = null;
  if (view.rows.length === 0) {
    if (scope === "everyone") empty = { title: `Nobody has played yet${when}.` };
    else if (noFriendAccounts)
      empty = {
        title: "None of your friends have Dota Den accounts yet",
        body: "Friends are players you track, your OpenDota teammates and people you've drafted with in rooms, once they sign in here.",
      };
    else empty = { title: `None of your friends have played yet${when}.` };
  }

  return (
    <section aria-label={`${BOARD_LABEL[kind]} leaderboard`} className="panel overflow-hidden">
      <div className="space-y-1 p-5 pb-3">
        <h2 className="font-display text-xl font-semibold tracking-wide">{BOARD_LABEL[kind]}</h2>
        <p className="text-xs text-muted-foreground">
          {BOARD_RULES[kind]}
          {period === "week" && " The week starts Monday 00:00 UTC."}
        </p>
      </div>

      {view.friendsIncomplete && scope === "friends" && (
        <p
          role="status"
          className="flex items-start gap-2 border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground"
        >
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Some of your friends couldn&apos;t be loaded right now (OpenDota may be busy), so this
          board may be missing people.
        </p>
      )}

      {empty ? (
        <div className="border-t border-white/[0.06]">
          <Empty title={empty.title} body={empty.body} board={kind} />
          {scope === "friends" && (
            <div className="border-t border-white/[0.06] px-5 py-4">
              <InviteHint />
            </div>
          )}
        </div>
      ) : (
        <>
          <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
            {view.rows.map((row) => (
              <BoardRow key={row.player.accountId32} kind={kind} row={row} />
            ))}
          </ol>
          {view.youBelowCut && (
            <div className="border-t border-dashed border-white/[0.1]">
              <p className="px-5 pt-3 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                Your position
              </p>
              <ol>
                <BoardRow kind={kind} row={view.youBelowCut} />
              </ol>
            </div>
          )}
          <div className="space-y-3 border-t border-white/[0.06] px-5 py-4 text-sm text-muted-foreground">
            <p>
              {plural(view.total, "player")} on this board{when}.
              {!youOnBoard && (
                <>
                  {" "}
                  You&apos;re not on it yet{when}.{" "}
                  <Link href={CTA[kind].href} className="text-gold hover:underline">
                    {CTA[kind].label}
                  </Link>
                  .
                </>
              )}
            </p>
            {scope === "friends" && !othersOnBoard && (
              <>
                <p>
                  {noFriendAccounts
                    ? "None of your friends have Dota Den accounts yet."
                    : `None of your friends have played yet${when}.`}
                </p>
                <InviteHint />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
