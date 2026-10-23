import Link from "next/link";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/domain/read-models";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import type { ContestedView, OverviewView } from "../dtos/responses/meta.dto";
import type { OverviewPool } from "../domain/meta-stats";
import { POSITION_INFO } from "../domain/position";
import { metaHref } from "./role-picker";
import { Unavailable } from "./meta-section";
import { formatDayRange, StratzAttribution } from "./stratz-attribution";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const positionsLabel = (pool: OverviewPool) =>
  pool.positions.length === 1
    ? POSITION_INFO[pool.positions[0]].short
    : `Pos ${pool.positions[0]}–${pool.positions[pool.positions.length - 1]}`;

/** One pool's heroes: portrait, name, high-rank win rate and a meter. */
async function PoolHeroes({
  pool,
  catalog,
  compact,
}: {
  pool: OverviewPool;
  catalog: Map<number, HeroInfo>;
  compact?: boolean;
}) {
  const t = await getT();
  if (pool.heroes.length === 0)
    return <p className="px-1 py-2 text-xs text-muted-foreground">{t("meta.overview.empty")}</p>;
  return (
    <ol className={compact ? "space-y-1.5" : "space-y-3"}>
      {pool.heroes.map((h, i) => {
        const hero = catalog.get(h.heroId);
        const name = heroName(hero, h.heroId);
        return (
          <li key={h.heroId} className={cn("flex items-center gap-3", compact && "h-9")}>
            <span className="w-3 shrink-0 text-right text-xs font-semibold text-gold tabular-nums">
              {i + 1}
            </span>
            <HeroPortrait hero={hero} heroId={h.heroId} size="sm" />
            <div className="min-w-0 flex-1">
              {compact ? (
                <p className="truncate text-sm font-medium">{name}</p>
              ) : (
                <Link
                  href={`/guides/${h.heroId}`}
                  className="block truncate text-sm font-medium hover:text-gold hover:underline touch:-my-2.5 touch:py-2.5"
                  title={name}
                >
                  {name}
                </Link>
              )}
              {h.atPosition && (
                <div className="flex items-center gap-2">
                  <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {t("meta.overview.winRateAt", {
                      rate: formatPercent(h.atPosition.rate),
                      pos: POSITION_INFO[h.atPosition.position].short,
                    })}
                  </p>
                  <span className="max-w-16 min-w-6 flex-1">
                    <WinRateBar rate={h.atPosition.rate} />
                  </span>
                </div>
              )}
              {!compact && h.atPosition && (
                <p className="text-[0.7rem] text-muted-foreground tabular-nums">
                  {t("meta.overview.positionGames", {
                    games: plural(t, "meta.counts.games", h.atPosition.games),
                    share: pct(h.atPosition.share),
                  })}
                </p>
              )}
              {!h.atPosition && h.highRank && (
                <div className="flex items-center gap-2">
                  <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {t("meta.overview.winRate", { rate: formatPercent(h.highRank.rate) })}
                  </p>
                  <span className="max-w-16 min-w-6 flex-1">
                    <WinRateBar rate={h.highRank.rate} />
                  </span>
                </div>
              )}
              {!compact && !h.atPosition && h.highRank && (
                <p className="text-[0.7rem] text-muted-foreground tabular-nums">
                  {plural(t, "meta.counts.games", h.highRank.games)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The Meta page's overview: the best heroes per role group, before a role is picked. */
export async function MetaOverviewCards({
  view,
  catalog,
}: {
  view: OverviewView;
  catalog: Map<number, HeroInfo>;
}) {
  const t = await getT();
  return (
    <>
      {view.pools.map((pool) => {
        return (
          <section
            key={pool.key}
            aria-label={t("meta.overview.poolsAria", {
              name: t(`meta.overview.pools.${pool.key}`),
            })}
            className="panel flex flex-col gap-4 p-5"
          >
            <div>
              <p className="kicker">{positionsLabel(pool)}</p>
              <h3 className="text-base font-semibold">{t(`meta.overview.pools.${pool.key}`)}</h3>
            </div>
            <PoolHeroes pool={pool} catalog={catalog} />
            <p className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.06] pt-3 text-xs text-muted-foreground">
              {t("meta.overview.fullRanking")}
              {pool.positions.map((p) => (
                <Link key={p} href={metaHref(p)} className="font-medium text-gold hover:underline">
                  {POSITION_INFO[p].short} · {POSITION_INFO[p].name}
                </Link>
              ))}
            </p>
          </section>
        );
      })}
    </>
  );
}

export async function MetaOverviewFootnote({ view, now }: { view: OverviewView; now: Date }) {
  const t = await getT();
  const ago = formatAgo(view.fetchedAt, now);
  return (
    <p className="text-xs text-muted-foreground">
      {view.positions ? (
        <>
          {t("meta.overview.sourcePositions", {
            range: formatDayRange(view.positions.window),
            ago,
          })}{" "}
          <StratzAttribution t={t} />
        </>
      ) : (
        t("meta.overview.source", { ago })
      )}
    </p>
  );
}

/** Compact overview for previews (the home page): pools stacked, no links per hero. */
export async function MetaOverviewCompact({
  view,
  catalog,
  className,
}: {
  view: OverviewView;
  catalog: Map<number, HeroInfo>;
  className?: string;
}) {
  const t = await getT();
  return (
    <div className={cn("space-y-4", className)}>
      {view.pools.map((pool) => (
        <section key={pool.key} aria-label={t(`meta.overview.pools.${pool.key}`)}>
          <p className="mb-2 flex items-baseline gap-2 text-xs">
            <span className="font-semibold tracking-wider text-gold uppercase">
              {positionsLabel(pool)}
            </span>
            <span className="text-muted-foreground">{t(`meta.overview.pools.${pool.key}`)}</span>
          </p>
          <PoolHeroes pool={pool} catalog={catalog} compact />
        </section>
      ))}
    </div>
  );
}

/** Heroes most picked or banned in recent tournaments. */
export async function ContestedCard({
  view,
  catalog,
  now,
}: {
  view: ContestedView | null;
  catalog: Map<number, HeroInfo>;
  now: Date;
}) {
  const t = await getT();
  const id = "meta-overview-contested";
  const drafts = (n: number) => plural(t, "meta.counts.proDrafts", n);
  return (
    <section aria-labelledby={id} className="panel flex flex-col gap-4 p-5">
      <div>
        <p className="kicker">{t("meta.overview.contested.kicker")}</p>
        <h3 id={id} className="text-base font-semibold">
          {t("meta.overview.contested.title")}
        </h3>
      </div>
      {!view ? (
        <Unavailable>{t("meta.overview.contested.unavailable")}</Unavailable>
      ) : view.status === "too_few" ? (
        <Unavailable>
          {t("meta.overview.contested.tooFew", {
            drafts: drafts(view.drafts),
            days: view.windowDays,
          })}
        </Unavailable>
      ) : (
        <>
          <ol className="space-y-3">
            {view.heroes.map((h, i) => {
              const hero = catalog.get(h.heroId);
              return (
                <li key={h.heroId} className="flex items-center gap-3">
                  <span className="w-3 text-right text-xs font-semibold text-gold tabular-nums">
                    {i + 1}
                  </span>
                  <HeroPortrait hero={hero} heroId={h.heroId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/guides/${h.heroId}`}
                      className="block truncate text-sm font-medium hover:text-gold hover:underline touch:-my-2.5 touch:py-2.5"
                    >
                      {heroName(hero, h.heroId)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      <span className="text-foreground">
                        {t("meta.overview.contested.contest", { pct: pct(h.contestRate) })}
                      </span>{" "}
                      ·{" "}
                      {t("meta.overview.contested.pickBan", {
                        picks: plural(t, "meta.counts.picks", h.picks),
                        bans: plural(t, "meta.counts.bans", h.bans),
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-auto border-t border-white/[0.06] pt-3 text-xs text-muted-foreground">
            {t("meta.overview.contested.source", {
              drafts: drafts(view.drafts),
              days: view.windowDays,
              ago: formatAgo(view.fetchedAt, now),
            })}
          </p>
        </>
      )}
    </section>
  );
}
