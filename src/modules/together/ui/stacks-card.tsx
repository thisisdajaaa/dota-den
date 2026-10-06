import Link from "next/link";
import { Fragment } from "react";
import { Trophy } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatPercent } from "@/modules/matches/ui/format";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { MIN_STACK_GAMES, MIN_TOGETHER_GAMES, type Stack } from "../domain/together-stats";
import type { TrioMember } from "./trios-card";

const SIZE = [null, "duo", "trio", "fourStack", "fiveStack"] as const;

/** Your parties by exactly who was in them, best first (win rate damped for small samples). */
export async function StacksCard({
  stacks,
  members,
  unknownPartyGames,
}: {
  stacks: Stack[];
  members: Map<number, TrioMember>;
  unknownPartyGames: number;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="stacks">
      <div className="p-5 pb-3">
        <p className="kicker">{t("together.stacks.kicker")}</p>
        <h2 id="stacks" className="text-lg font-semibold">
          {t("together.stacks.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("together.stacks.description", { min: MIN_STACK_GAMES })}
        </p>
      </div>
      {stacks.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <Trophy aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>{t("together.stacks.empty", { min: MIN_STACK_GAMES })}</p>
        </div>
      ) : (
        <ol className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {stacks.map((s, i) => {
            const people = s.friends.map((id) => {
              const m = members.get(id);
              return { id, name: displayName(m?.personaName ?? null, id), avatar: m?.avatarUrl };
            });
            return (
              <li key={s.friends.join(":")} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 text-right text-sm text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="flex -space-x-2">
                  {people.map((p) => (
                    <PlayerAvatar key={p.id} url={p.avatar ?? null} name={p.name} size="sm" />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t("together.stacks.you")}{" "}
                    {people.map((p, j) => (
                      <Fragment key={p.id}>
                        {j > 0 && (j === people.length - 1 ? ` ${t("together.and")} ` : ", ")}
                        <Link href={`/together/${p.id}`} className="hover:text-gold">
                          {p.name}
                        </Link>
                      </Fragment>
                    ))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`together.stacks.${SIZE[s.friends.length + 1] ?? "party"}`)} ·{" "}
                    {plural(t, "together.units.game", s.games)} ·{" "}
                    <span className="text-win">{s.wins}W</span>{" "}
                    <span className="text-loss">{s.games - s.wins}L</span>
                    {s.games >= MIN_TOGETHER_GAMES && ` · ${formatPercent(s.wins / s.games)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {unknownPartyGames > 0 && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {plural(t, "together.stacks.unknownParty", unknownPartyGames)}
        </p>
      )}
    </section>
  );
}
