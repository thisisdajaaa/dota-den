import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo, ItemInfo } from "../application/ports";
import type { MatchPlayer, PartyGroup } from "../domain/match-detail";
import { HeroPortrait, heroName } from "./hero-portrait";
import { ItemIcon } from "./item-icon";
import { parseRankTier } from "../domain/rank-tier";
import { RankMedal, rankLabel } from "./rank-medal";

function num(v: number | null): string {
  if (v === null) return "—";
  return v >= 10_000 ? `${(v / 1_000).toFixed(1)}k` : v.toLocaleString();
}

export function Scoreboard({
  side,
  won,
  score,
  players,
  parties,
  heroes,
  items,
  viewerAccountId,
}: {
  side: "radiant" | "dire";
  won: boolean;
  score: number;
  players: MatchPlayer[];
  parties: PartyGroup[];
  heroes: Map<number, HeroInfo>;
  items: Map<number, ItemInfo>;
  viewerAccountId: number | null;
}) {
  const partyOf = (slot: number) => parties.find((p) => p.playerSlots.includes(slot));
  const radiant = side === "radiant";
  const totals = players.reduce(
    (acc, p) => ({ nw: acc.nw + (p.netWorth ?? 0), dmg: acc.dmg + (p.heroDamage ?? 0) }),
    { nw: 0, dmg: 0 },
  );

  return (
    <section className="panel overflow-hidden" aria-labelledby={`team-${side}`}>
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3",
          radiant
            ? "bg-gradient-to-r from-win/15 to-transparent"
            : "bg-gradient-to-r from-loss/15 to-transparent",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn("h-6 w-1 rounded-full", radiant ? "bg-win" : "bg-loss")}
          />
          <h2 id={`team-${side}`} className="font-display text-lg font-bold tracking-wider">
            {radiant ? "The Radiant" : "The Dire"}
          </h2>
          {won && (
            <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider text-gold uppercase">
              Victory
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          {totals.nw > 0 && <span>{num(totals.nw)} net worth</span>}
          <span className="text-2xl font-semibold text-foreground">{score}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] table-fixed text-sm whitespace-nowrap">
          {/* Fixed widths so Radiant and Dire columns line up. */}
          <colgroup>
            <col className="w-[16rem]" />
            <col className="w-[6rem]" />
            <col className="w-[5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[4rem]" />
            <col className="w-[19rem]" />
          </colgroup>
          <caption className="sr-only">{radiant ? "Radiant" : "Dire"} scoreboard</caption>
          <thead>
            <tr className="text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
              <th scope="col" className="py-2 pr-3 pl-5 font-medium">
                Player
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title="Kills / Deaths / Assists" className="cursor-help no-underline">
                  K / D / A
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title="Last hits / Denies" className="cursor-help no-underline">
                  LH / DN
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <abbr
                  title="Gold per minute / Experience per minute"
                  className="cursor-help no-underline"
                >
                  GPM / XPM
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Net worth
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title="Damage dealt to heroes" className="cursor-help no-underline">
                  Hero dmg
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title="Damage dealt to buildings" className="cursor-help no-underline">
                  Tower dmg
                </abbr>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title="Healing done to allies" className="cursor-help no-underline">
                  Healing
                </abbr>
              </th>
              <th scope="col" className="py-2 pr-5 pl-3 font-medium">
                Items
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {players.map((p) => {
              const hero = heroes.get(p.heroId);
              const party = partyOf(p.playerSlot);
              const isViewer = viewerAccountId !== null && p.accountId32 === viewerAccountId;
              const rank = parseRankTier(p.rankTier);
              return (
                <tr
                  key={p.playerSlot}
                  className={cn(
                    "transition-colors hover:bg-white/[0.025]",
                    isViewer && "bg-gold/[0.06]",
                  )}
                  aria-current={isViewer ? "true" : undefined}
                >
                  <td className="relative py-2 pr-3 pl-5">
                    {isViewer && (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-gold"
                      />
                    )}
                    <div className="flex items-center gap-3">
                      <span className="relative">
                        <HeroPortrait hero={hero} heroId={p.heroId} size="md" />
                        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-background text-[0.6rem] font-semibold tabular-nums ring-1 ring-white/15">
                          {p.level}
                        </span>
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {p.accountId32 !== null && p.personaName ? (
                            <Link
                              href={`/players/${p.accountId32}`}
                              className="max-w-32 truncate font-medium hover:text-gold hover:underline"
                            >
                              {p.personaName}
                            </Link>
                          ) : (
                            <span className="max-w-32 truncate font-medium text-muted-foreground italic">
                              Anonymous
                            </span>
                          )}
                          {isViewer && (
                            <span className="rounded bg-gold/15 px-1 text-[0.6rem] font-semibold text-gold">
                              YOU
                            </span>
                          )}
                          {party && (
                            <span
                              className="rounded border border-white/15 px-1 text-[0.6rem] text-muted-foreground"
                              title={`Queued together (party ${party.label}, ${party.playerSlots.length} players)`}
                            >
                              P{party.label}
                            </span>
                          )}
                        </div>
                        <div
                          className="max-w-44 truncate text-[0.7rem] text-muted-foreground"
                          title={[
                            rank ? rankLabel(rank) : "Unranked",
                            heroName(hero, p.heroId),
                            p.hasScepter ? "Aghanim's Scepter" : null,
                            p.hasShard ? "Aghanim's Shard" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          {rank ? (
                            <span className="font-medium text-gold/90">
                              <span className="mr-0.5 inline-block align-[-4px]">
                                <RankMedal rank={rank} size={16} />
                              </span>
                              {rankLabel(rank)}
                            </span>
                          ) : (
                            "Unranked"
                          )}
                          {" · "}
                          {heroName(hero, p.heroId)}
                          {p.hasScepter && " · Scepter"}
                          {p.hasShard && " · Shard"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <span className="font-semibold">{p.kills}</span>
                    <span className="text-muted-foreground"> / </span>
                    {p.deaths}
                    <span className="text-muted-foreground"> / </span>
                    {p.assists}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                    <span className="text-foreground">{p.lastHits}</span> / {p.denies}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                    <span className="text-foreground">{p.goldPerMin}</span> / {p.xpPerMin}
                  </td>
                  <td className="px-2 py-2 text-right text-gold tabular-nums">{num(p.netWorth)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(p.heroDamage)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(p.towerDamage)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(p.heroHealing)}</td>
                  <td className="py-2 pr-5 pl-3">
                    <div className="flex items-center gap-1">
                      {p.items.map((id, i) => (
                        <ItemIcon key={i} itemId={id} items={items} />
                      ))}
                      <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
                      <ItemIcon itemId={p.neutralItem} items={items} round />
                    </div>
                    {p.backpack.some((b) => b !== null) && (
                      <div
                        className="mt-1 flex items-center gap-1 opacity-60"
                        aria-label="Backpack"
                      >
                        {p.backpack.map((id, i) => (
                          <ItemIcon key={i} itemId={id} items={items} size="sm" />
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
