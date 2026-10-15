import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { clockTime } from "@/modules/matches/domain/match-laning";
import type { ItemInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { ItemIcon } from "@/modules/matches/ui/item-icon";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import type { HeroCoaching, ItemImpactView, TimingSide } from "../domain/hero-coaching";

const ROLE_KEYS = { 1: "safe", 2: "mid", 3: "off", 4: "jungle" } as const;

/** Win rate in games you bought each item vs games you didn't (correlation, not cause). */
export async function WhatWorksCard({
  impact,
  items,
  heroLabel,
}: {
  impact: ItemImpactView;
  /** Catalog entries by item key. */
  items: Map<string, ItemInfo>;
  heroLabel: string;
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const byId = new Map([...items.values()].map((i) => [i.id, i]));
  return (
    <MetaSection
      id="what-works"
      kicker={t("heroes.coaching.kicker")}
      title={t("heroes.coaching.worksTitle")}
      description={t("heroes.coaching.worksDescription", {
        games: games(impact.withData),
        hero: heroLabel,
      })}
      footer={t("heroes.coaching.worksFooter", { min: impact.minGames })}
    >
      {impact.rows.length === 0 ? (
        <Unavailable>
          {t("heroes.coaching.worksNotEnough", {
            games: games(impact.withData),
            min: impact.minGames,
          })}
        </Unavailable>
      ) : (
        <ul
          className="divide-y divide-white/[0.05] border-t border-white/[0.06]"
          aria-label={t("heroes.coaching.worksListLabel")}
        >
          {impact.rows.map((r) => {
            const info = items.get(r.key);
            const pts = Math.round(r.delta * 1000) / 10;
            return (
              <li key={r.key} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <ItemIcon itemId={info?.id ?? null} items={byId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {info?.name ?? r.key.replaceAll("_", " ")}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {t("heroes.coaching.bought", {
                      rate: formatPercent(r.bought.winRate),
                      games: games(r.bought.games),
                    })}
                    {" · "}
                    {t("heroes.coaching.skipped", {
                      rate: formatPercent(r.skipped.winRate),
                      games: games(r.skipped.games),
                    })}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold tabular-nums",
                    pts > 0 ? "text-win" : pts < 0 ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {t("heroes.coaching.points", { pts: `${pts > 0 ? "+" : ""}${pts.toFixed(1)}` })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </MetaSection>
  );
}

function Timing({ side }: { side: TimingSide }) {
  return side.median === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="font-semibold">{clockTime(side.median)}</span>
  );
}

/** Your typical item timings in wins vs losses, and lane results by role (stored extras). */
export async function TimingsCard({
  coaching,
  items,
  heroLabel,
}: {
  coaching: HeroCoaching;
  items: Map<string, ItemInfo>;
  heroLabel: string;
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const byId = new Map([...items.values()].map((i) => [i.id, i]));
  const progress = t("heroes.coaching.analysed", {
    analysed: coaching.analysed,
    parsed: games(coaching.parsedGames),
    hero: heroLabel,
  });
  return (
    <MetaSection
      id="hero-timings"
      kicker={t("heroes.coaching.kicker")}
      title={t("heroes.coaching.timingsTitle")}
      description={progress}
      footer={coaching.enough ? t("heroes.coaching.timingsFooter") : undefined}
    >
      {!coaching.enough ? (
        <Unavailable>
          {t("heroes.coaching.timingsNotEnough", { min: coaching.minGames, hero: heroLabel })}
        </Unavailable>
      ) : (
        <div className="space-y-4 border-t border-white/[0.06] px-5 py-4">
          {coaching.timings.length > 0 && (
            <table className="w-full text-sm" aria-label={t("heroes.coaching.timingsLabel")}>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-normal">{t("heroes.coaching.item")}</th>
                  <th className="pb-2 text-right font-normal">{t("heroes.coaching.inWins")}</th>
                  <th className="pb-2 text-right font-normal">{t("heroes.coaching.inLosses")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {coaching.timings.map((r) => {
                  const info = items.get(r.key);
                  return (
                    <tr key={r.key} className="border-t border-white/[0.05]">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <ItemIcon itemId={info?.id ?? null} items={byId} size="sm" />
                          <span className="truncate">
                            {info?.name ?? r.key.replaceAll("_", " ")}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Timing side={r.wins} />{" "}
                        <span className="text-xs text-muted-foreground">({r.wins.games})</span>
                      </td>
                      <td className="py-2 text-right">
                        <Timing side={r.losses} />{" "}
                        <span className="text-xs text-muted-foreground">({r.losses.games})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {coaching.lanes.length > 0 && (
            <ul className="space-y-2 text-sm" aria-label={t("heroes.coaching.lanesLabel")}>
              {coaching.lanes.map((l) => (
                <li key={l.laneRole} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="w-20 shrink-0 font-medium">
                    {t(
                      `heroes.coaching.roles.${ROLE_KEYS[l.laneRole as keyof typeof ROLE_KEYS]}` as never,
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("heroes.coaching.laneGames", {
                      games: games(l.games),
                      wins: l.wins,
                    })}
                    {l.lane.compared > 0 &&
                      ` · ${t("heroes.coaching.laneResults", {
                        won: l.lane.won,
                        even: l.lane.even,
                        lost: l.lane.lost,
                      })}`}
                    {l.efficiency &&
                      ` · ${t("heroes.coaching.efficiency", {
                        pct: Math.round(l.efficiency.median),
                      })}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {coaching.noLaneRole > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("heroes.coaching.noLaneRole", { games: games(coaching.noLaneRole) })}
            </p>
          )}
        </div>
      )}
    </MetaSection>
  );
}
