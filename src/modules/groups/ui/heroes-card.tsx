import { getT } from "@/common/i18n/server";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { MemberHeroesDto } from "../dtos/responses/groups.dto";
import { memberName, type MemberLookup } from "./member-names";

/** Each member's most played heroes in the last 30 days. */
export async function HeroesCard({
  rows,
  members,
  heroes,
}: {
  rows: MemberHeroesDto[];
  members: MemberLookup;
  heroes: Map<number, HeroInfo>;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="heroes-title">
      <div className="p-5 pb-3">
        <p className="kicker">{t("groups.heroes.kicker")}</p>
        <h2 id="heroes-title" className="text-lg font-semibold">
          {t("groups.heroes.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("groups.heroes.description")}</p>
      </div>
      <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
        {rows.map((r) => {
          const name = memberName(members, r.accountId32);
          return (
            <li key={r.accountId32} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <PlayerAvatar
                url={members.get(r.accountId32)?.avatarUrl ?? null}
                name={name}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.games > 0 ? t("groups.heroes.games", { n: r.games }) : t("groups.heroes.none")}
                </p>
              </div>
              {r.heroes.length > 0 && (
                <ul className="flex gap-2">
                  {r.heroes.map((h) => (
                    <li key={h.heroId} className="flex flex-col items-center gap-0.5">
                      <HeroPortrait hero={heroes.get(h.heroId)} heroId={h.heroId} size="sm" />
                      <span className="text-[0.65rem] text-muted-foreground">
                        <span className="sr-only">
                          {heroName(heroes.get(h.heroId), h.heroId)}:{" "}
                        </span>
                        {h.games} · {h.wins}W
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
