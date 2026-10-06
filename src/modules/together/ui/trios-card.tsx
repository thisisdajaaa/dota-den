import Link from "next/link";
import { Users } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { formatPercent } from "@/modules/matches/ui/format";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { MIN_TOGETHER_GAMES, rateOf, type Trio } from "../domain/together-stats";

export interface TrioMember {
  personaName: string | null;
  avatarUrl: string | null;
}

/** Friends you queued with as a three (or more): confirmed parties only. */
export async function TriosCard({
  trios,
  members,
}: {
  trios: Trio[];
  members: Map<number, TrioMember>;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="trios">
      <div className="p-5 pb-3">
        <p className="kicker">{t("together.trios.kicker")}</p>
        <h2 id="trios" className="text-lg font-semibold">
          {t("together.trios.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("together.trios.description")}</p>
      </div>
      {trios.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>{t("together.trios.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {trios.map((trio) => {
            const people = trio.friends.map((id) => {
              const m = members.get(id);
              return { id, name: displayName(m?.personaName ?? null, id), avatar: m?.avatarUrl };
            });
            const rate = rateOf(trio);
            return (
              <li key={trio.friends.join(":")} className="flex items-center gap-3 px-5 py-3">
                <span className="flex -space-x-2">
                  {people.map((p) => (
                    <PlayerAvatar key={p.id} url={p.avatar ?? null} name={p.name} size="sm" />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t("together.trios.you")}{" "}
                    <Link href={`/together/${people[0].id}`} className="hover:text-gold">
                      {people[0].name}
                    </Link>{" "}
                    {t("together.and")}{" "}
                    <Link href={`/together/${people[1].id}`} className="hover:text-gold">
                      {people[1].name}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("together.trios.asParty", {
                      games: plural(t, "together.units.game", trio.games),
                    })}{" "}
                    · <span className="text-win">{trio.wins}W</span>{" "}
                    <span className="text-loss">{trio.games - trio.wins}L</span>
                    {trio.games >= MIN_TOGETHER_GAMES &&
                      ` · ${t("together.trios.winRate", { rate: formatPercent(rate) })}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
