import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo, ItemInfo } from "@/modules/matches/domain/read-models";
import { getT } from "@/common/i18n/server";
import { englishMessages, type Messages } from "@/common/i18n/messages";
import { plural, translator, type Translator } from "@/common/i18n/translate";
import { formatAgo, formatPercent } from "@/modules/matches/ui/format";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { ItemIcon } from "@/modules/matches/ui/item-icon";
import { WinRateBar } from "@/modules/matches/ui/win-rate-bar";
import { MetaSection, Unavailable } from "@/modules/meta/ui/meta-section";
import {
  MIN_ITEM_GAMES,
  MIN_MATCHUP_GAMES,
  MIN_SAMPLE,
  type HeroIndexRow,
  type HighRankComparison,
  type MatchupEntry,
  type WinRateTrend,
} from "../domain/hero-stats";
import type { HeroDetailsView, MatchupsView } from "../dtos/responses/heroes.dto";
import type { SourceError } from "../heroes.ports";

export { Unavailable };

type T = Translator<Messages>;

const SUBJECTS = {
  "lane data": "laneData",
  "public hero stats": "publicHeroStats",
  "item data": "itemData",
  matchups: "matchups",
} as const;

export type UnavailableSubject = keyof typeof SUBJECTS;

const englishT = translator<Messages>(englishMessages, englishMessages);

/** "OpenDota is busy" vs "unavailable", in the app's usual words (English without `t`). */
export function unavailableCopy(
  error: SourceError | { type: "error" },
  what: UnavailableSubject,
  t: T = englishT,
): string {
  const key = SUBJECTS[what];
  return error.type === "rate_limited"
    ? t(`heroes.unavailable.${key}.busy`)
    : t(`heroes.unavailable.${key}.down`);
}

/** A signed change in percentage points: "+1.2", "-0.4". */
function pp(delta: number): string {
  const v = (delta * 100).toFixed(1);
  return `${delta >= 0 ? "+" : ""}${v}`;
}

export async function HeroBanner({
  hero,
  heroId,
  games,
}: {
  hero: HeroInfo | undefined;
  heroId: number;
  games: number;
}) {
  const t = await getT();
  const name = heroName(hero, heroId);
  return (
    <section
      aria-label={t("heroes.banner.label")}
      className="panel relative flex items-center gap-5 overflow-hidden p-6"
    >
      {hero?.renderUrl && (
        <Image
          src={hero.renderUrl}
          alt=""
          width={220}
          height={220}
          className="pointer-events-none absolute -right-6 -bottom-10 hidden opacity-40 sm:block"
        />
      )}
      <HeroPortrait hero={hero} heroId={heroId} size="lg" />
      <div className="relative min-w-0 space-y-1">
        <p className="kicker">{t("heroes.banner.kicker")}</p>
        <h1 className="font-display text-3xl font-bold tracking-wide">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {[hero?.attackType, ...(hero?.roles ?? []).slice(0, 3)].filter(Boolean).join(" · ") ||
            t("heroes.banner.detailsUnavailable")}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {games > 0 && (
            <Link href={`/matches?hero=${heroId}`} className="text-gold hover:underline">
              {t("heroes.banner.allMatches", {
                matches: plural(t, "heroes.counts.matches", games),
                name,
              })}
            </Link>
          )}
          <Link href={`/guides/${heroId}`} className="text-gold hover:underline">
            {t("heroes.banner.proGuide", { name })}
          </Link>
        </p>
      </div>
    </section>
  );
}

export async function TrendCard({ trend, heroLabel }: { trend: WinRateTrend; heroLabel: string }) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const byPatch = trend.by === "patch";
  return (
    <MetaSection
      id="hero-trend"
      kicker={t("heroes.trend.kicker")}
      title={t("heroes.trend.title")}
      description={
        byPatch
          ? t("heroes.trend.byPatch", { hero: heroLabel })
          : t("heroes.trend.byMonth", { hero: heroLabel })
      }
      footer={
        <>
          {trend.buckets.length > 0 && t("heroes.trend.faded", { n: MIN_SAMPLE })}
          {trend.unassigned > 0 && t("heroes.trend.noPatch", { games: games(trend.unassigned) })}
          {trend.older > 0 &&
            t("heroes.trend.older", { games: plural(t, "heroes.counts.olderGames", trend.older) })}
        </>
      }
    >
      {trend.buckets.length === 0 ? (
        <Unavailable>{t("heroes.trend.empty")}</Unavailable>
      ) : (
        <ul
          className="space-y-2 px-5 pb-4"
          aria-label={byPatch ? t("heroes.trend.byPatchLabel") : t("heroes.trend.byMonthLabel")}
        >
          {trend.buckets.map((b) => (
            <li
              key={b.key}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm"
              title={t("heroes.trend.barTitle", {
                label: b.label,
                rate: formatPercent(b.winRate),
                games: games(b.games),
              })}
            >
              <span className="font-medium tabular-nums">{b.label}</span>
              <WinRateBar rate={b.winRate} muted={b.lowSample} />
              <span className="w-40 text-right text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{formatPercent(b.winRate)}</span> ·{" "}
                {games(b.games)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </MetaSection>
  );
}

export async function HighRankCard({
  comparison,
  heroLabel,
  yourGames,
}: {
  comparison: HighRankComparison;
  heroLabel: string;
  yourGames: number;
}) {
  const t = await getT();
  return (
    <MetaSection
      id="hero-high-rank"
      kicker={t("heroes.highRank.kicker")}
      title={t("heroes.highRank.title")}
      footer={t("heroes.highRank.footer")}
    >
      <div className="space-y-2 px-5 pb-4 text-sm">
        <p>
          <span className="text-2xl font-semibold tabular-nums">
            {formatPercent(comparison.publicRate)}
          </span>{" "}
          <span className="text-muted-foreground">
            {t("heroes.highRank.over", {
              games: comparison.publicGames.toLocaleString("en-US"),
              hero: heroLabel,
            })}
          </span>
        </p>
        <WinRateBar rate={comparison.publicRate} />
        <p className="text-muted-foreground">
          {comparison.delta === null
            ? t("heroes.highRank.tooFew", {
                games: plural(t, "heroes.counts.games", yourGames),
                hero: heroLabel,
                min: MIN_SAMPLE,
              })
            : t(comparison.delta >= 0 ? "heroes.highRank.above" : "heroes.highRank.below", {
                delta: pp(comparison.delta),
              })}
        </p>
      </div>
    </MetaSection>
  );
}

function MatchupList({
  title,
  entries,
  heroes,
  empty,
  t,
}: {
  title: string;
  entries: MatchupEntry[];
  heroes: Map<number, HeroInfo>;
  empty: string;
  t: T;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5" aria-label={title}>
          {entries.map((e) => {
            const hero = heroes.get(e.heroId);
            return (
              <li key={e.heroId} className="grid grid-cols-[auto_1fr] items-center gap-3">
                <HeroPortrait hero={hero} heroId={e.heroId} size="sm" />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{heroName(hero, e.heroId)}</span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                      <span className="font-semibold text-foreground">
                        {formatPercent(e.winRate)}
                      </span>{" "}
                      · {plural(t, "heroes.counts.games", e.games)}
                    </span>
                  </div>
                  <WinRateBar rate={e.winRate} className="h-1.5" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export async function MatchupsCard({
  view,
  heroes,
  heroLabel,
}: {
  view: MatchupsView;
  heroes: Map<number, HeroInfo>;
  heroLabel: string;
}) {
  const t = await getT();
  const m = view.matchups;
  return (
    <MetaSection
      id="hero-matchups"
      kicker={t("heroes.matchups.kicker")}
      title={t("heroes.matchups.title", { hero: heroLabel })}
      footer={t("heroes.matchups.footer", {
        games: plural(t, "heroes.counts.games", view.games),
        hero: heroLabel,
        min: m.minGames,
        enemies: plural(t, "heroes.counts.enemyHeroes", m.enemiesBelowMin),
        allies: plural(t, "heroes.counts.alliedHeroes", m.alliesBelowMin),
      })}
    >
      <div className="grid grid-cols-1 gap-6 px-5 pb-5 md:grid-cols-3">
        <MatchupList
          title={t("heroes.matchups.beat")}
          entries={m.beats}
          heroes={heroes}
          empty={t("heroes.matchups.emptyBeat", { min: MIN_MATCHUP_GAMES })}
          t={t}
        />
        <MatchupList
          title={t("heroes.matchups.loseTo")}
          entries={m.losesTo}
          heroes={heroes}
          empty={t("heroes.matchups.emptyLoseTo", { min: MIN_MATCHUP_GAMES })}
          t={t}
        />
        <MatchupList
          title={t("heroes.matchups.winWith")}
          entries={m.allies}
          heroes={heroes}
          empty={t("heroes.matchups.emptyWinWith", { min: MIN_MATCHUP_GAMES })}
          t={t}
        />
      </div>
    </MetaSection>
  );
}

export async function ItemsCard({
  details,
  items,
  heroLabel,
}: {
  details: HeroDetailsView;
  /** Catalog entries by item key. */
  items: Map<string, ItemInfo>;
  heroLabel: string;
}) {
  const t = await getT();
  const games = (n: number) => plural(t, "heroes.counts.games", n);
  const summary = details.items;
  const byId = new Map([...items.values()].map((i) => [i.id, i]));
  return (
    <MetaSection
      id="hero-items"
      kicker={t("heroes.items.kicker")}
      title={t("heroes.items.title")}
      footer={
        summary
          ? t("heroes.items.footer", {
              withData: games(summary.withData),
              sample: games(summary.sample),
              hero: heroLabel,
            })
          : undefined
      }
    >
      {!summary ? (
        <Unavailable>{t("heroes.items.noNames")}</Unavailable>
      ) : !summary.enough ? (
        <Unavailable>
          {t("heroes.items.notEnough", {
            games: games(summary.withData),
            hero: heroLabel,
            min: MIN_ITEM_GAMES,
          })}
        </Unavailable>
      ) : summary.items.length === 0 ? (
        <Unavailable>{t("heroes.items.none")}</Unavailable>
      ) : (
        <ul className="space-y-2 px-5 pb-4" aria-label={t("heroes.items.listLabel")}>
          {summary.items.map((it) => {
            const info = items.get(it.key);
            return (
              <li key={it.key} className="flex items-center gap-3 text-sm">
                <ItemIcon itemId={info?.id ?? null} items={byId} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {info?.name ?? it.key.replaceAll("_", " ")}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{formatPercent(it.share)}</span>{" "}
                  {t("heroes.items.ofGames", { games: it.games, total: summary.withData })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </MetaSection>
  );
}

/** Grid of every hero you've played, linking to each hero page. */
export async function HeroGrid({
  rows,
  heroes,
  now,
}: {
  rows: HeroIndexRow[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  const t = await getT();
  return (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label={t("heroes.grid.label")}
    >
      {rows.map((r) => {
        const hero = heroes.get(r.heroId);
        const name = heroName(hero, r.heroId);
        return (
          <li key={r.heroId}>
            <Link
              href={`/heroes/${r.heroId}`}
              aria-label={t("heroes.grid.cardLabel", {
                name,
                games: plural(t, "heroes.counts.games", r.games),
                rate: formatPercent(r.winRate),
              })}
              className="panel flex items-center gap-3 p-3 transition-colors hover:border-gold/30 hover:bg-white/[0.03]"
            >
              <HeroPortrait hero={hero} heroId={r.heroId} size="md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{name}</span>
                  <span
                    className={cn(
                      "text-sm tabular-nums",
                      r.lowSample ? "text-muted-foreground" : "font-semibold",
                    )}
                  >
                    {formatPercent(r.winRate)}
                  </span>
                </div>
                <WinRateBar rate={r.winRate} muted={r.lowSample} className="h-1.5" />
                <p className="text-[0.7rem] text-muted-foreground tabular-nums">
                  {plural(t, "heroes.counts.games", r.games)} · KDA {r.kda?.toFixed(2) ?? "—"}
                  {r.lastPlayed && ` · ${formatAgo(r.lastPlayed, now)}`}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
