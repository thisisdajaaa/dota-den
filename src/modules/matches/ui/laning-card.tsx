import { getT } from "@/common/i18n/server";
import type { HeroInfo, ItemInfo } from "../matches.ports";
import type { MatchPlayer } from "../domain/match-detail";
import { clockTime, keyItemTimings, laneOpponents } from "../domain/match-laning";
import { HeroPortrait, heroName } from "./hero-portrait";
import { ItemIcon } from "./item-icon";
import { ParseRequest } from "./parse-request";

/** Items worth a timing: real purchases, not consumables, components or recipes. */
const KEY_ITEM_MIN_COST = 1_400;

const LANE_ROLE: Record<number, "safe" | "mid" | "off" | "jungle"> = {
  1: "safe",
  2: "mid",
  3: "off",
  4: "jungle",
};

function fmt(n: number | null, digits = 0): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Laning at 10 minutes against the lane opponents, item timings, and support work. */
export async function LaningCard({
  matchId,
  players,
  selected,
  isViewer,
  heroes,
  items,
}: {
  matchId: string;
  players: MatchPlayer[];
  selected: MatchPlayer | null;
  isViewer: boolean;
  heroes: Map<number, HeroInfo>;
  items: Map<number, ItemInfo>;
}) {
  const t = await getT();
  const parsed = players.some((p) => p.laning !== null);
  const byKey = new Map([...items.values()].map((i) => [i.key, i]));

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="laning-title">
      <div>
        <p className="kicker">{t("matches.laning.kicker")}</p>
        <h2 id="laning-title" className="text-lg font-semibold">
          {t("matches.laning.title")}
        </h2>
      </div>

      {!parsed ? (
        <>
          <p className="text-sm text-muted-foreground">{t("matches.laning.notParsed")}</p>
          <ParseRequest matchId={matchId} />
        </>
      ) : !selected?.laning ? (
        <p className="text-sm text-muted-foreground">{t("matches.laning.pickPrompt")}</p>
      ) : (
        (() => {
          const l = selected.laning;
          const hero = heroes.get(selected.heroId);
          const opponents = laneOpponents(players, selected);
          const timings = keyItemTimings(l.purchases, (key) => {
            const it = byKey.get(key);
            return (
              !!it &&
              !key.startsWith("recipe_") &&
              it.qual !== "consumable" &&
              (it.cost ?? 0) >= KEY_ITEM_MIN_COST
            );
          });
          const rows = [selected, ...opponents];
          return (
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  {t("matches.laning.at10")}
                  {l.laneRole && LANE_ROLE[l.laneRole]
                    ? ` · ${t(`matches.laning.roles.${LANE_ROLE[l.laneRole]}`)}`
                    : ""}
                  {l.roaming ? ` · ${t("matches.laning.roaming")}` : ""}
                  {l.efficiencyPct !== null && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      {t("matches.laning.efficiency", { pct: fmt(l.efficiencyPct) })}
                    </span>
                  )}
                </h3>
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("matches.laning.caption")}</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1 font-medium">
                        {opponents.length ? t("matches.laning.lane") : t("matches.laning.player")}
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        {t("matches.laning.lastHits")}
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        {t("matches.laning.denies")}
                      </th>
                      <th scope="col" className="py-1 text-right font-medium">
                        {t("matches.laning.goldEarned")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {rows.map((p) => {
                      const h = heroes.get(p.heroId);
                      const me = p === selected;
                      return (
                        <tr
                          key={p.playerSlot}
                          className={me ? "font-medium" : "text-muted-foreground"}
                        >
                          <th scope="row" className="py-1.5 text-left font-[inherit]">
                            <span className="flex items-center gap-2">
                              <HeroPortrait hero={h} heroId={p.heroId} size="xs" />
                              <span className="truncate">
                                {heroName(h, p.heroId)}
                                {me && isViewer ? t("matches.laning.you") : ""}
                              </span>
                            </span>
                          </th>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmt(p.laning?.lastHitsAt10 ?? null)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmt(p.laning?.deniesAt10 ?? null)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmt(p.laning?.goldAt10 ?? null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {opponents.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("matches.laning.noOpponent", { hero: heroName(hero, selected.heroId) })}
                  </p>
                )}
              </div>

              {timings.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{t("matches.laning.itemTimings")}</h3>
                  <ul className="flex flex-wrap gap-2">
                    {timings.map((t) => {
                      const it = byKey.get(t.key)!;
                      return (
                        <li
                          key={t.key}
                          className="flex items-center gap-1.5 rounded-md bg-white/[0.04] py-1 pr-2 pl-1 text-xs"
                        >
                          <ItemIcon itemId={it.id} items={items} size="sm" />
                          <span>{it.name}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {clockTime(t.time)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  [
                    t("matches.laning.wards"),
                    t("matches.laning.wardsValue", {
                      obs: fmt(l.observers),
                      sen: fmt(l.sentries),
                    }),
                  ],
                  [t("matches.laning.campsStacked"), fmt(l.campsStacked)],
                  [
                    t("matches.laning.stuns"),
                    l.stunsSec === null
                      ? "—"
                      : t("matches.laning.stunsValue", { n: fmt(l.stunsSec, 1) }),
                  ],
                  [
                    t("matches.laning.teamFights"),
                    l.teamfight === null ? "—" : `${Math.round(l.teamfight * 100)}%`,
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })()
      )}
    </section>
  );
}
