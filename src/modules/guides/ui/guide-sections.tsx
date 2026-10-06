import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { HeroInfo, ItemInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { ItemIcon } from "@/modules/matches/ui/item-icon";
import {
  formatBench,
  PHASES,
  MIN_MATCHUP_GAMES,
  type Benchmark,
  type Counter,
  type ItemPick,
  type Phase,
  type ProGame,
} from "../domain/hero-guide";

function Unavailable({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export async function ItemBuilds({
  items,
  itemMap,
}: {
  items: Record<Phase, ItemPick[]> | null;
  itemMap: Map<number, ItemInfo>;
}) {
  const t = await getT();
  const phaseLabel = (phase: Phase) => t(`guides.items.phases.${phase}`);
  return (
    <section aria-labelledby="guide-items" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">{t("guides.items.kicker")}</p>
        <h2 id="guide-items" className="text-lg font-semibold">
          {t("guides.items.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("guides.items.description")}</p>
      </div>
      {!items ? (
        <Unavailable text={t("guides.unavailable")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PHASES.map((phase) => (
            <div key={phase} aria-label={phaseLabel(phase)} role="group">
              <h3 className="mb-2 text-sm font-semibold">{phaseLabel(phase)}</h3>
              {items[phase].length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("guides.items.noData")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {items[phase].map((it) => {
                    const name =
                      itemMap.get(it.itemId)?.name ??
                      t("guides.items.fallbackName", { id: it.itemId });
                    return (
                      <li key={it.itemId} className="flex items-center gap-2.5">
                        <ItemIcon itemId={it.itemId} items={itemMap} />
                        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                        <span
                          aria-hidden
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]"
                        >
                          <span
                            className="block h-full rounded-full bg-gold/70"
                            style={{ width: `${Math.round(it.relative * 100)}%` }}
                          />
                        </span>
                        <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                          {it.count.toLocaleString("en-US")}×
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export async function Benchmarks({ benchmarks }: { benchmarks: Benchmark[] | null }) {
  const t = await getT();
  return (
    <section aria-labelledby="guide-bench" className="panel overflow-hidden">
      <div className="p-5 pb-3">
        <p className="kicker">{t("guides.bench.kicker")}</p>
        <h2 id="guide-bench" className="text-lg font-semibold">
          {t("guides.bench.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("guides.bench.description")}</p>
      </div>
      {!benchmarks ? (
        <div className="px-5 pb-5">
          <Unavailable text={t("guides.unavailable")} />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-2 font-medium">
                {t("guides.bench.stat")}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t("guides.bench.typical")}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t("guides.bench.top10")}
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                {t("guides.bench.top1")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {benchmarks.map((b) => (
              <tr key={b.stat}>
                <th scope="row" className="px-5 py-2.5 text-left font-normal">
                  {t(`guides.bench.stats.${b.stat}`)}
                </th>
                <td className="px-2 py-2.5 text-right text-muted-foreground tabular-nums">
                  {formatBench(b.stat, b.median)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {formatBench(b.stat, b.top10)}
                </td>
                <td className="px-5 py-2.5 text-right font-semibold text-gold tabular-nums">
                  {formatBench(b.stat, b.top1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export async function ProGames({
  games,
  heroLabel,
  now,
}: {
  games: ProGame[] | null;
  heroLabel: string;
  now: Date;
}) {
  const t = await getT();
  const wins = games?.filter((g) => g.won).length ?? 0;
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return (
    <section aria-labelledby="guide-pro-games" className="panel overflow-hidden">
      <div className="p-5 pb-3">
        <p className="kicker">{t("guides.proGames.kicker")}</p>
        <h2 id="guide-pro-games" className="text-lg font-semibold">
          {t("guides.proGames.title", { hero: heroLabel })}
        </h2>
        {games && games.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t("guides.proGames.summary", {
              wins,
              losses: games.length - wins,
              n: games.length,
            })}
          </p>
        )}
      </div>
      {!games ? (
        <div className="px-5 pb-5">
          <Unavailable text={t("guides.unavailable")} />
        </div>
      ) : games.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{t("guides.proGames.none")}</p>
      ) : (
        <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          {games.map((g) => (
            <li key={g.matchId}>
              <Link
                href={`/matches/${g.matchId}`}
                className="group flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.03]"
              >
                <span
                  className={cn(
                    "w-9 shrink-0 text-xs font-semibold",
                    g.won ? "text-win" : "text-loss",
                  )}
                >
                  {g.won ? t("guides.proGames.win") : t("guides.proGames.loss")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-gold">
                    {g.playerName ?? t("guides.proGames.unnamed")}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {g.leagueName ?? t("guides.proGames.league")} ·{" "}
                    {now.getTime() - g.startedAt.getTime() < 300 * 86_400_000
                      ? date.format(g.startedAt)
                      : g.startedAt.getUTCFullYear()}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  <span className="block text-foreground" title={t("guides.proGames.kdaTitle")}>
                    {g.kills}/{g.deaths}/{g.assists}
                    <span className="sr-only"> {t("guides.proGames.kdaSr")}</span>
                  </span>
                  {duration(g.durationSec)}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CounterList({
  title,
  rows,
  heroes,
  good,
  noneText,
  gamesText,
}: {
  title: string;
  rows: Counter[];
  heroes: Map<number, HeroInfo>;
  good: boolean;
  noneText: string;
  gamesText: (n: number) => string;
}) {
  return (
    <div role="group" aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{noneText}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const h = heroes.get(r.heroId);
            return (
              <li key={r.heroId}>
                <Link
                  href={`/guides/${r.heroId}`}
                  className="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-white/[0.03]"
                >
                  <HeroPortrait hero={h} heroId={r.heroId} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm group-hover:text-gold">
                    {heroName(h, r.heroId)}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      good ? "text-win" : "text-loss",
                    )}
                  >
                    {(r.rate * 100).toFixed(0)}%
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                    {gamesText(r.games)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Who the hero beats and who beats it, in pro games. */
export async function Counters({
  counters,
  heroes,
  heroLabel,
}: {
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[] } | null;
  heroes: Map<number, HeroInfo>;
  heroLabel: string;
}) {
  const t = await getT();
  const noneText = t("guides.counters.none");
  const gamesText = (n: number) => t("guides.counters.games", { n: n.toLocaleString("en-US") });
  return (
    <section aria-labelledby="guide-counters" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">{t("guides.counters.kicker")}</p>
        <h2 id="guide-counters" className="text-lg font-semibold">
          {t("guides.counters.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("guides.counters.description", { hero: heroLabel, min: MIN_MATCHUP_GAMES })}
        </p>
      </div>
      {!counters ? (
        <Unavailable text={t("guides.unavailable")} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CounterList
            title={t("guides.counters.strong", { hero: heroLabel })}
            rows={counters.strongAgainst}
            heroes={heroes}
            good
            noneText={noneText}
            gamesText={gamesText}
          />
          <CounterList
            title={t("guides.counters.weak", { hero: heroLabel })}
            rows={counters.weakAgainst}
            heroes={heroes}
            good={false}
            noneText={noneText}
            gamesText={gamesText}
          />
        </div>
      )}
    </section>
  );
}
