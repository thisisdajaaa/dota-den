import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { HeroInfo, ItemInfo } from "@/modules/matches/domain/read-models";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { ItemIcon } from "@/modules/matches/ui/item-icon";
import {
  benchLabel,
  formatBench,
  PHASES,
  MIN_MATCHUP_GAMES,
  type Benchmark,
  type Counter,
  type ItemPick,
  type Phase,
  type ProGame,
} from "../domain/hero-guide";

const PHASE_LABEL: Record<Phase, string> = {
  start: "Starting items",
  early: "Early game",
  mid: "Mid game",
  late: "Late game",
};

function Unavailable() {
  return <p className="text-sm text-muted-foreground">Unavailable right now. Try again later.</p>;
}

export function ItemBuilds({
  items,
  itemMap,
}: {
  items: Record<Phase, ItemPick[]> | null;
  itemMap: Map<number, ItemInfo>;
}) {
  return (
    <section aria-labelledby="guide-items" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">Pro games</p>
        <h2 id="guide-items" className="text-lg font-semibold">
          What pros buy
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Most-bought items in each phase of recent professional games, from OpenDota. Consumables
          are left out after the start.
        </p>
      </div>
      {!items ? (
        <Unavailable />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PHASES.map((phase) => (
            <div key={phase} aria-label={PHASE_LABEL[phase]} role="group">
              <h3 className="mb-2 text-sm font-semibold">{PHASE_LABEL[phase]}</h3>
              {items[phase].length === 0 ? (
                <p className="text-xs text-muted-foreground">No data.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items[phase].map((it) => {
                    const name = itemMap.get(it.itemId)?.name ?? `Item #${it.itemId}`;
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

export function Benchmarks({ benchmarks }: { benchmarks: Benchmark[] | null }) {
  return (
    <section aria-labelledby="guide-bench" className="panel overflow-hidden">
      <div className="p-5 pb-3">
        <p className="kicker">Benchmarks</p>
        <h2 id="guide-bench" className="text-lg font-semibold">
          What strong games look like
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          From recent public games on this hero: the typical game, and what the best 10% and best 1%
          of games reached.
        </p>
      </div>
      {!benchmarks ? (
        <div className="px-5 pb-5">
          <Unavailable />
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-white/[0.06] text-left text-xs text-muted-foreground">
              <th scope="col" className="px-5 py-2 font-medium">
                Stat
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Typical
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Top 10%
              </th>
              <th scope="col" className="px-5 py-2 text-right font-medium">
                Top 1%
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {benchmarks.map((b) => (
              <tr key={b.stat}>
                <th scope="row" className="px-5 py-2.5 text-left font-normal">
                  {benchLabel(b.stat)}
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

export function ProGames({
  games,
  heroLabel,
  now,
}: {
  games: ProGame[] | null;
  heroLabel: string;
  now: Date;
}) {
  const wins = games?.filter((g) => g.won).length ?? 0;
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return (
    <section aria-labelledby="guide-pro-games" className="panel overflow-hidden">
      <div className="p-5 pb-3">
        <p className="kicker">Watch and learn</p>
        <h2 id="guide-pro-games" className="text-lg font-semibold">
          Recent pro games on {heroLabel}
        </h2>
        {games && games.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {wins}–{games.length - wins} in the last {games.length}. Open one for the scoreboard,
            items and graphs.
          </p>
        )}
      </div>
      {!games ? (
        <div className="px-5 pb-5">
          <Unavailable />
        </div>
      ) : games.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No recent pro games.</p>
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
                  {g.won ? "Win" : "Loss"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-gold">
                    {g.playerName ?? "Unnamed player"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {g.leagueName ?? "League game"} ·{" "}
                    {now.getTime() - g.startedAt.getTime() < 300 * 86_400_000
                      ? date.format(g.startedAt)
                      : g.startedAt.getUTCFullYear()}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  <span className="block text-foreground" title="Kills / deaths / assists">
                    {g.kills}/{g.deaths}/{g.assists}
                    <span className="sr-only"> kills, deaths, assists</span>
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
}: {
  title: string;
  rows: Counter[];
  heroes: Map<number, HeroInfo>;
  good: boolean;
}) {
  return (
    <div role="group" aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No clear matchups yet.</p>
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
                    {r.games} games
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
export function Counters({
  counters,
  heroes,
  heroLabel,
}: {
  counters: { strongAgainst: Counter[]; weakAgainst: Counter[] } | null;
  heroes: Map<number, HeroInfo>;
  heroLabel: string;
}) {
  return (
    <section aria-labelledby="guide-counters" className="panel space-y-4 p-5">
      <div>
        <p className="kicker">Pro games</p>
        <h2 id="guide-counters" className="text-lg font-semibold">
          Matchups
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {heroLabel}&apos;s win rate against each hero in pro games. Only heroes with{" "}
          {MIN_MATCHUP_GAMES}+ games count, and small samples are pulled toward 50% when ranking.
        </p>
      </div>
      {!counters ? (
        <Unavailable />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CounterList
            title={`${heroLabel} is strong against`}
            rows={counters.strongAgainst}
            heroes={heroes}
            good
          />
          <CounterList
            title={`${heroLabel} struggles against`}
            rows={counters.weakAgainst}
            heroes={heroes}
            good={false}
          />
        </div>
      )}
    </section>
  );
}
