import Image from "next/image";
import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo, ItemInfo } from "@/modules/matches/domain/read-models";
import { formatAgo, formatPercent, plural } from "@/modules/matches/ui/format";
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

/** "OpenDota is busy" vs "unavailable", in the app's usual words. */
export function unavailableCopy(error: SourceError | { type: "error" }, what: string): string {
  return error.type === "rate_limited"
    ? `OpenDota is getting a lot of requests right now, so ${what} can't be loaded. Try again in a minute.`
    : `${what.replace(/^./, (c) => c.toUpperCase())} ${what.endsWith("s") ? "are" : "is"} unavailable right now. Try again shortly.`;
}

/** "1 match", "8 matches", "2 enemy heroes": for words `plural` doesn't cover. */
export function countOf(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function pp(delta: number): string {
  const v = (delta * 100).toFixed(1);
  return `${delta >= 0 ? "+" : ""}${v} points`;
}

export function HeroBanner({
  hero,
  heroId,
  games,
}: {
  hero: HeroInfo | undefined;
  heroId: number;
  games: number;
}) {
  const name = heroName(hero, heroId);
  return (
    <section
      aria-label="Hero"
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
        <p className="kicker">Your hero</p>
        <h1 className="font-display text-3xl font-bold tracking-wide">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {[hero?.attackType, ...(hero?.roles ?? []).slice(0, 3)].filter(Boolean).join(" · ") ||
            "Hero details unavailable"}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {games > 0 && (
            <Link href={`/matches?hero=${heroId}`} className="text-gold hover:underline">
              All {countOf(games, "match", "matches")} on {name}
            </Link>
          )}
          <Link href={`/guides/${heroId}`} className="text-gold hover:underline">
            Pro guide for {name}
          </Link>
        </p>
      </div>
    </section>
  );
}

export function TrendCard({ trend, heroLabel }: { trend: WinRateTrend; heroLabel: string }) {
  const byPatch = trend.by === "patch";
  return (
    <MetaSection
      id="hero-trend"
      kicker="Over time"
      title="Win rate trend"
      description={
        byPatch
          ? `Your win rate on ${heroLabel}, split by patch.`
          : `Your win rate on ${heroLabel}, split by month. We split by patch only when your games cover at least two patches and the patch is known for most of them.`
      }
      footer={
        <>
          {trend.buckets.length > 0 && (
            <>Faded bars have under {MIN_SAMPLE} games: too few to judge. </>
          )}
          {trend.unassigned > 0 &&
            `${plural(trend.unassigned, "game")} with no known patch left out. `}
          {trend.older > 0 && `${plural(trend.older, "older game")} not shown.`}
        </>
      }
    >
      {trend.buckets.length === 0 ? (
        <Unavailable>No games to chart yet.</Unavailable>
      ) : (
        <ul className="space-y-2 px-5 pb-4" aria-label={byPatch ? "By patch" : "By month"}>
          {trend.buckets.map((b) => (
            <li
              key={b.key}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm"
              title={`${b.label}: ${formatPercent(b.winRate)} over ${plural(b.games, "game")}`}
            >
              <span className="font-medium tabular-nums">{b.label}</span>
              <WinRateBar rate={b.winRate} muted={b.lowSample} />
              <span className="w-40 text-right text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{formatPercent(b.winRate)}</span> ·{" "}
                {plural(b.games, "game")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </MetaSection>
  );
}

export function HighRankCard({
  comparison,
  heroLabel,
  yourGames,
}: {
  comparison: HighRankComparison;
  heroLabel: string;
  yourGames: number;
}) {
  return (
    <MetaSection
      id="hero-high-rank"
      kicker="Public games"
      title="High-rank win rate"
      footer="Public high-rank games are Ancient, Divine and Immortal combined (OpenDota)."
    >
      <div className="space-y-2 px-5 pb-4 text-sm">
        <p>
          <span className="text-2xl font-semibold tabular-nums">
            {formatPercent(comparison.publicRate)}
          </span>{" "}
          <span className="text-muted-foreground">
            over {comparison.publicGames.toLocaleString("en-US")} public high-rank games on{" "}
            {heroLabel}
          </span>
        </p>
        <WinRateBar rate={comparison.publicRate} />
        <p className="text-muted-foreground">
          {comparison.delta === null
            ? `You have ${plural(yourGames, "game")} on ${heroLabel}: too few to compare (${MIN_SAMPLE}+ needed).`
            : `You are ${pp(comparison.delta)} ${comparison.delta >= 0 ? "above" : "below"} that.`}
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
}: {
  title: string;
  entries: MatchupEntry[];
  heroes: Map<number, HeroInfo>;
  empty: string;
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
                      · {plural(e.games, "game")}
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

export function MatchupsCard({
  view,
  heroes,
  heroLabel,
}: {
  view: MatchupsView;
  heroes: Map<number, HeroInfo>;
  heroLabel: string;
}) {
  const m = view.matchups;
  return (
    <MetaSection
      id="hero-matchups"
      kicker="Matchups"
      title={`Who you beat and lose to on ${heroLabel}`}
      footer={`From your ${plural(view.games, "game")} on ${heroLabel} on OpenDota. Heroes you met in fewer than ${m.minGames} games are left out (${countOf(m.enemiesBelowMin, "enemy hero", "enemy heroes")}, ${countOf(m.alliesBelowMin, "allied hero", "allied heroes")}).`}
    >
      <div className="grid grid-cols-1 gap-6 px-5 pb-5 md:grid-cols-3">
        <MatchupList
          title="You beat"
          entries={m.beats}
          heroes={heroes}
          empty={`No enemy hero with ${MIN_MATCHUP_GAMES}+ games where you win half or more.`}
        />
        <MatchupList
          title="You lose to"
          entries={m.losesTo}
          heroes={heroes}
          empty={`No enemy hero with ${MIN_MATCHUP_GAMES}+ games where you lose more than you win.`}
        />
        <MatchupList
          title="You win with"
          entries={m.allies}
          heroes={heroes}
          empty={`No allied hero with ${MIN_MATCHUP_GAMES}+ games where you win half or more.`}
        />
      </div>
    </MetaSection>
  );
}

export function ItemsCard({
  details,
  items,
  heroLabel,
}: {
  details: HeroDetailsView;
  /** Catalog entries by item key. */
  items: Map<string, ItemInfo>;
  heroLabel: string;
}) {
  const summary = details.items;
  const byId = new Map([...items.values()].map((i) => [i.id, i]));
  return (
    <MetaSection
      id="hero-items"
      kicker="Items"
      title="Your most-bought items"
      footer={
        summary
          ? `From ${plural(summary.withData, "game")} with purchase data (parsed replays) among your last ${plural(summary.sample, "game")} on ${heroLabel}. Consumables, recipes and cheap components are left out.`
          : undefined
      }
    >
      {!summary ? (
        <Unavailable>
          Item names are unavailable right now, so we can&apos;t list items.
        </Unavailable>
      ) : !summary.enough ? (
        <Unavailable>
          Only {plural(summary.withData, "game")} on {heroLabel} have purchase data. Item stats show
          once at least {MIN_ITEM_GAMES} of your games have parsed replays.
        </Unavailable>
      ) : summary.items.length === 0 ? (
        <Unavailable>No notable items in your games with purchase data.</Unavailable>
      ) : (
        <ul className="space-y-2 px-5 pb-4" aria-label="Most-bought items">
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
                  of games · {it.games} of {summary.withData}
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
export function HeroGrid({
  rows,
  heroes,
  now,
}: {
  rows: HeroIndexRow[];
  heroes: Map<number, HeroInfo>;
  now: Date;
}) {
  return (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Heroes you've played"
    >
      {rows.map((r) => {
        const hero = heroes.get(r.heroId);
        const name = heroName(hero, r.heroId);
        return (
          <li key={r.heroId}>
            <Link
              href={`/heroes/${r.heroId}`}
              aria-label={`${name}: ${plural(r.games, "game")}, ${formatPercent(r.winRate)} win rate`}
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
                  {plural(r.games, "game")} · KDA {r.kda?.toFixed(2) ?? "—"}
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
