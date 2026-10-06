import Link from "next/link";
import { Info, Medal, UserPlus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { getT } from "@/common/i18n/server";
import type { Messages } from "@/common/i18n/messages";
import { plural, type Translator } from "@/common/i18n/translate";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { formatPercent } from "@/modules/matches/ui/format";
import { RankMedal } from "@/modules/matches/ui/rank-medal";
import { PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { BoardView, PlayerView } from "../dtos/responses/leaderboard-views.dto";
import type { BoardKind } from "../domain/ranking";
type T = Translator<Messages>;

const CTA_HREF: Record<BoardKind, string> = {
  drafts: "/draft",
  challenges: "/draft/challenges",
  rooms: "/draft/rooms/new",
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

function statsOf(t: T, kind: BoardKind, row: Row): Stat[] {
  const s = row.stats as Record<string, unknown>;
  switch (kind) {
    case "drafts": {
      const grade = s.bestGrade as string | null;
      return [
        { label: t("leaderboards.stats.drafts"), value: String(s.drafts) },
        {
          label: t("leaderboards.stats.bestScore"),
          value: score(s.bestScore as number | null),
          detail: grade ? t("leaderboards.stats.grade", { grade }) : undefined,
        },
        {
          label: t("leaderboards.stats.avgScore"),
          value: score(s.avgScore as number | null),
          secondary: true,
        },
      ];
    }
    case "challenges":
      return [
        { label: t("leaderboards.stats.correct"), value: String(s.correct) },
        { label: t("leaderboards.stats.bestStreak"), value: String(s.bestStreak) },
        {
          label: t("leaderboards.stats.accuracy"),
          value: formatPercent(s.accuracy as number | null),
          detail: t("leaderboards.stats.ofAnswers", {
            answers: plural(t, "leaderboards.units.answer", s.answered as number),
          }),
          secondary: true,
        },
      ];
    case "rooms":
      return [
        { label: t("leaderboards.stats.drafts"), value: String(s.drafts) },
        {
          label: t("leaderboards.stats.wins"),
          value: String(s.wins),
          detail: t("leaderboards.stats.selfReported"),
        },
        { label: t("leaderboards.stats.losses"), value: String(s.losses), secondary: true },
      ];
  }
}

function PlayerCell({ t, player }: { t: T; player: PlayerView }) {
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
              {t("leaderboards.board.you")}
            </span>
          )}
        </p>
        {!rank && (
          <p className="text-xs text-muted-foreground">{t("leaderboards.board.rankUnknown")}</p>
        )}
      </div>
      {rank && <RankMedal rank={rank} size={36} className="ml-auto sm:ml-0" />}
    </div>
  );
}

function BoardRow({ t, kind, row }: { t: T; kind: BoardKind; row: Row }) {
  const podium = row.rank <= 3;
  return (
    <li
      aria-label={t(
        row.player.isYou ? "leaderboards.board.rowLabelYou" : "leaderboards.board.rowLabel",
        { rank: row.rank, name: row.player.name },
      )}
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
      <PlayerCell t={t} player={row.player} />
      <dl className="ml-12 grid w-full grid-cols-2 gap-x-4 gap-y-1 text-right sm:ml-0 sm:w-auto sm:grid-cols-3">
        {statsOf(t, kind, row).map((stat) => (
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

function InviteHint({ t }: { t: T }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
      <span>
        {t("leaderboards.board.inviteBefore")}{" "}
        <Link href="/draft/rooms/new" className="text-gold hover:underline">
          /draft/rooms/new
        </Link>{" "}
        {t("leaderboards.board.inviteAfter")}
      </span>
    </p>
  );
}

function Empty({
  t,
  title,
  body,
  board,
}: {
  t: T;
  title: string;
  body?: string;
  board: BoardKind;
}) {
  return (
    <div className="grid place-items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <Medal aria-hidden className="size-5" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      <Button asChild size="sm">
        <Link href={CTA_HREF[board]}>{t(`leaderboards.cta.${board}`)}</Link>
      </Button>
    </div>
  );
}

/** One leaderboard: ranked rows, your own row highlighted, honest empty states. */
export async function LeaderboardBoard({ view }: { view: BoardView }) {
  const t = await getT();
  const { kind, scope, period } = view;
  const week = period === "week";
  const youOnBoard = view.rows.some((r) => r.player.isYou) || view.youBelowCut !== null;
  const othersOnBoard = view.rows.some((r) => !r.player.isYou);
  const noFriendAccounts = scope === "friends" && view.friendsWithAccounts === 0;

  let empty: { title: string; body?: string } | null = null;
  if (view.rows.length === 0) {
    if (scope === "everyone")
      empty = {
        title: t(week ? "leaderboards.board.nobodyWeek" : "leaderboards.board.nobody"),
      };
    else if (noFriendAccounts)
      empty = {
        title: t("leaderboards.board.noAccountsTitle"),
        body: t("leaderboards.board.noAccountsBody"),
      };
    else
      empty = {
        title: t(
          week ? "leaderboards.board.friendsNotPlayedWeek" : "leaderboards.board.friendsNotPlayed",
        ),
      };
  }

  return (
    <section
      aria-label={t("leaderboards.board.label", { board: t(`leaderboards.boards.${kind}`) })}
      className="panel overflow-hidden"
    >
      <div className="space-y-1 p-5 pb-3">
        <h2 className="font-display text-xl font-semibold tracking-wide">
          {t(`leaderboards.boards.${kind}`)}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(`leaderboards.rules.${kind}`)}
          {week && ` ${t("leaderboards.weekStarts")}`}
        </p>
      </div>

      {view.friendsIncomplete && scope === "friends" && (
        <p
          role="status"
          className="flex items-start gap-2 border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground"
        >
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t("leaderboards.board.friendsIncomplete")}
        </p>
      )}

      {empty ? (
        <div className="border-t border-white/[0.06]">
          <Empty t={t} title={empty.title} body={empty.body} board={kind} />
          {scope === "friends" && (
            <div className="border-t border-white/[0.06] px-5 py-4">
              <InviteHint t={t} />
            </div>
          )}
        </div>
      ) : (
        <>
          <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
            {view.rows.map((row) => (
              <BoardRow key={row.player.accountId32} t={t} kind={kind} row={row} />
            ))}
          </ol>
          {view.youBelowCut && (
            <div className="border-t border-dashed border-white/[0.1]">
              <p className="px-5 pt-3 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
                {t("leaderboards.board.yourPosition")}
              </p>
              <ol>
                <BoardRow t={t} kind={kind} row={view.youBelowCut} />
              </ol>
            </div>
          )}
          <div className="space-y-3 border-t border-white/[0.06] px-5 py-4 text-sm text-muted-foreground">
            <p>
              {plural(
                t,
                week ? "leaderboards.board.totalWeek" : "leaderboards.board.total",
                view.total,
              )}
              {!youOnBoard && (
                <>
                  {" "}
                  {t(week ? "leaderboards.board.notOnYetWeek" : "leaderboards.board.notOnYet")}{" "}
                  <Link href={CTA_HREF[kind]} className="text-gold hover:underline">
                    {t(`leaderboards.cta.${kind}`)}
                  </Link>
                  .
                </>
              )}
            </p>
            {scope === "friends" && !othersOnBoard && (
              <>
                <p>
                  {noFriendAccounts
                    ? t("leaderboards.board.noAccounts")
                    : t(
                        week
                          ? "leaderboards.board.friendsNotPlayedWeek"
                          : "leaderboards.board.friendsNotPlayed",
                      )}
                </p>
                <InviteHint t={t} />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
