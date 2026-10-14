import { getT } from "@/common/i18n/server";
import { formatPercent } from "@/modules/matches/ui/format";
import { PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { WeeklyBoardDto } from "../dtos/responses/groups.dto";
import { memberName, type MemberLookup } from "./member-names";

/** Ranked wins and losses this week per member. No MMR. */
export async function WeeklyBoardCard({
  board,
  members,
}: {
  board: WeeklyBoardDto;
  members: MemberLookup;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="board-title">
      <div className="p-5 pb-3">
        <p className="kicker">{t("groups.board.kicker")}</p>
        <h2 id="board-title" className="text-lg font-semibold">
          {t("groups.board.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("groups.board.description")}</p>
      </div>
      {board.rows.length === 0 ? (
        <p className="border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          {t("groups.board.none")}
        </p>
      ) : (
        <table className="w-full border-t border-white/[0.06] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2 font-medium">
                {t("groups.board.rank")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("groups.board.player")}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t("groups.board.record")}
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                {t("groups.board.winRate")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {board.rows.map((r) => {
              const name = memberName(members, r.accountId32);
              return (
                <tr
                  key={r.accountId32}
                  className={members.get(r.accountId32)?.you ? "bg-gold/5" : undefined}
                >
                  <td className="px-5 py-2.5 font-semibold text-gold">{r.rank}</td>
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <PlayerAvatar
                        url={members.get(r.accountId32)?.avatarUrl ?? null}
                        name={name}
                        size="sm"
                      />
                      <span className="truncate">{name}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className="text-win">{r.wins}</span>–
                    <span className="text-loss">{r.losses}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatPercent(r.winRate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {board.idle.length > 0 && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {t("groups.board.idle", {
            names: board.idle.map((id) => memberName(members, id)).join(", "),
          })}
        </p>
      )}
      <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
        {t("groups.board.note")}
      </p>
    </section>
  );
}
