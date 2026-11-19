import { EXTRAS_PER_DAY, PLUS_EXTRAS_PER_DAY } from "@/modules/matches/domain/match-extras";
import Link from "next/link";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { clockTime } from "@/modules/matches/domain/match-laning";
import type { ItemInfo } from "@/modules/matches/domain/read-models";
import { formatPercent } from "@/modules/matches/ui/format";
import { ItemIcon } from "@/modules/matches/ui/item-icon";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import { SUGGEST_GAP_SEC, type BuildCheck } from "../domain/build-check";
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
  pace = "none",
}: {
  coaching: HeroCoaching;
  items: Map<string, ItemInfo>;
  heroLabel: string;
  /**
   * How fast the rest is read: "plus" (the Plus daily cap), "free" (the free cap, with what
   * Plus adds) or "none" (nothing said; Plus isn't on sale).
   */
  pace?: "plus" | "free" | "none";
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const byId = new Map([...items.values()].map((i) => [i.id, i]));
  const analysed = t("heroes.coaching.analysed", {
    analysed: coaching.analysed,
    parsed: games(coaching.parsedGames),
    hero: heroLabel,
  });
  // Only while there's more to read: once everything is analysed, the pace doesn't matter.
  const behind = coaching.analysed < coaching.parsedGames;
  const progress =
    behind && pace !== "none"
      ? `${analysed} ${t(
          pace === "plus" ? "heroes.coaching.pacePlus" : "heroes.coaching.paceFree",
          {
            free: EXTRAS_PER_DAY,
            plus: PLUS_EXTRAS_PER_DAY,
          },
        )}`
      : analysed;
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

/** Gap in m:ss with a sign: "+2:10" later than high-rank, "−0:40" earlier. */
function gapTime(sec: number): string {
  if (sec === 0) return "0:00";
  return `${sec > 0 ? "+" : "−"}${clockTime(Math.abs(sec))}`;
}

/**
 * Build check (Plus): your item timings against Legend–Immortal pubs at your position, with
 * one suggestion. Free players see what it is when Plus is on sale (no numbers computed).
 */
export async function BuildCheckCard({
  check,
  items,
  heroLabel,
  locked = false,
}: {
  check: BuildCheck | null;
  items: Map<string, ItemInfo>;
  heroLabel: string;
  /** Not Plus: a short note about the feature, nothing computed. */
  locked?: boolean;
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const name = (key: string) => items.get(key)?.name ?? key;
  const byId = new Map([...items.values()].map((i) => [i.id, i]));
  if (locked) {
    return (
      <MetaSection
        id="hero-build-check"
        kicker={t("heroes.buildCheck.kicker")}
        title={t("heroes.buildCheck.title")}
      >
        <p className="border-t border-gold/30 bg-gold/5 px-5 py-3 text-sm">
          {t("heroes.buildCheck.locked", { hero: heroLabel })}{" "}
          <Link href="/plus" className="font-medium text-gold hover:underline">
            {t("heroes.buildCheck.seePlus")}
          </Link>
        </p>
      </MetaSection>
    );
  }
  if (!check) return null;
  if (check.status !== "ok") {
    return (
      <MetaSection
        id="hero-build-check"
        kicker={t("heroes.buildCheck.kicker")}
        title={t("heroes.buildCheck.title")}
      >
        <Unavailable>
          {check.status === "no_role"
            ? t("heroes.buildCheck.noRole", { hero: heroLabel })
            : t("heroes.buildCheck.notEnough", {
                games: games(check.yourGames),
                min: check.minGames,
                hero: heroLabel,
              })}
        </Unavailable>
      </MetaSection>
    );
  }
  const pos = t("heroes.buildCheck.pos", { n: check.position });
  return (
    <MetaSection
      id="hero-build-check"
      kicker={t("heroes.buildCheck.kicker")}
      title={t("heroes.buildCheck.title")}
      description={t("heroes.buildCheck.description", {
        yours: games(check.yourGames),
        pos,
        theirs: games(check.theirGames),
        hero: heroLabel,
      })}
      footer={t("heroes.buildCheck.footer")}
    >
      <div className="space-y-4 border-t border-white/[0.06] px-5 py-4">
        <p className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm">
          {check.suggestion
            ? t("heroes.buildCheck.suggestion", {
                item: name(check.suggestion.key),
                gap: clockTime(check.suggestion.gap),
                yours: clockTime(check.suggestion.yours.median),
                theirs: clockTime(check.suggestion.theirs.median),
                pos,
              })
            : t("heroes.buildCheck.onPace", { pos })}
        </p>
        {check.rows.length > 0 ? (
          <table className="w-full text-sm" aria-label={t("heroes.buildCheck.tableLabel")}>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-normal">{t("heroes.coaching.item")}</th>
                <th className="pb-2 text-right font-normal">{t("heroes.buildCheck.you")}</th>
                <th className="pb-2 text-right font-normal">{t("heroes.buildCheck.them")}</th>
                <th className="pb-2 text-right font-normal">{t("heroes.buildCheck.gap")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {check.rows.map((r) => (
                <tr key={r.key} className="border-t border-white/[0.04]">
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <ItemIcon itemId={items.get(r.key)?.id ?? null} items={byId} size="sm" />
                      {name(r.key)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    <span className="font-semibold">{clockTime(r.yours.median)}</span>{" "}
                    <span className="text-muted-foreground">({r.yours.games})</span>
                  </td>
                  <td className="py-1.5 text-right">{clockTime(r.theirs.median)}</td>
                  <td
                    className={cn(
                      "py-1.5 text-right",
                      r.gap >= SUGGEST_GAP_SEC ? "text-loss" : r.gap <= 0 ? "text-win" : "",
                    )}
                  >
                    {gapTime(r.gap)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">{t("heroes.buildCheck.noItems")}</p>
        )}
      </div>
    </MetaSection>
  );
}
