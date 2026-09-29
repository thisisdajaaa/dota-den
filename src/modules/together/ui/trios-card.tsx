import Link from "next/link";
import { Users } from "lucide-react";
import { formatPercent, plural } from "@/modules/matches/ui/format";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import { MIN_TOGETHER_GAMES, rateOf, type Trio } from "../domain/together-stats";

export interface TrioMember {
  personaName: string | null;
  avatarUrl: string | null;
}

/** Friends you queued with as a three (or more): confirmed parties only. */
export function TriosCard({ trios, members }: { trios: Trio[]; members: Map<number, TrioMember> }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="trios">
      <div className="p-5 pb-3">
        <p className="kicker">Trios</p>
        <h2 id="trios" className="text-lg font-semibold">
          Your usual trios
        </h2>
        <p className="text-xs text-muted-foreground">
          Games where you and two friends were in the same party. Counts grow as you open each
          friend&apos;s page and more matches are analysed.
        </p>
      </div>
      {trios.length === 0 ? (
        <div className="flex items-start gap-3 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground">
          <Users aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>No trios found yet. Open a friend&apos;s page to analyse your games together.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {trios.map((t) => {
            const people = t.friends.map((id) => {
              const m = members.get(id);
              return { id, name: displayName(m?.personaName ?? null, id), avatar: m?.avatarUrl };
            });
            const rate = rateOf(t);
            return (
              <li key={t.friends.join(":")} className="flex items-center gap-3 px-5 py-3">
                <span className="flex -space-x-2">
                  {people.map((p) => (
                    <PlayerAvatar key={p.id} url={p.avatar ?? null} name={p.name} size="sm" />
                  ))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    You,{" "}
                    <Link href={`/together/${people[0].id}`} className="hover:text-gold">
                      {people[0].name}
                    </Link>{" "}
                    and{" "}
                    <Link href={`/together/${people[1].id}`} className="hover:text-gold">
                      {people[1].name}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plural(t.games, "game")} as a party ·{" "}
                    <span className="text-win">{t.wins}W</span>{" "}
                    <span className="text-loss">{t.games - t.wins}L</span>
                    {t.games >= MIN_TOGETHER_GAMES && ` · ${formatPercent(rate)} win rate`}
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
