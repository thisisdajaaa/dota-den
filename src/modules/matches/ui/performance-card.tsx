import Link from "next/link";
import { cn } from "cn";
import type { HeroInfo } from "../application/ports";
import type { MatchPlayer } from "../domain/match-detail";
import {
  betterThan,
  formatPerfValue,
  perfLabel,
  performanceHighlights,
  performanceLines,
} from "../domain/match-performance";
import { HeroPortrait, heroName } from "./hero-portrait";

/**
 * "How did I play?": one player's stats against everyone else on the same hero, with a
 * picker for the other players in the match.
 */
export function PerformanceCard({
  players,
  selected,
  isViewer,
  heroes,
  hrefFor,
}: {
  players: MatchPlayer[];
  selected: MatchPlayer | null;
  isViewer: boolean;
  heroes: Map<number, HeroInfo>;
  hrefFor: (playerSlot: number) => string;
}) {
  const withData = players.filter((p) => performanceLines(p.benchmarks).length > 0);
  if (withData.length === 0) return null;
  const hero = selected ? heroes.get(selected.heroId) : undefined;
  const hName = selected ? heroName(hero, selected.heroId) : "";
  const lines = selected ? performanceLines(selected.benchmarks) : [];
  const { best, worst } = performanceHighlights(lines);
  const who = !selected ? null : isViewer ? "you" : (selected.personaName ?? `the ${hName} player`);
  const bracket = lines.some((l) => l.pctBracket !== null);

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="performance">
      <div>
        <p className="kicker">Performance</p>
        <h2 id="performance" className="text-lg font-semibold">
          {selected ? (isViewer ? "How you played" : `How ${who} played`) : "How did they play?"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {selected
            ? `Against recent games on ${hName}, from OpenDota${bracket ? ", and against games at this match's rank" : ""}.`
            : "Pick a player to compare their game with everyone else on the same hero."}
        </p>
      </div>

      <nav aria-label="Choose a player" className="flex flex-wrap gap-1.5">
        {withData.map((p) => {
          const h = heroes.get(p.heroId);
          const active = selected?.playerSlot === p.playerSlot;
          return (
            <Link
              key={p.playerSlot}
              href={hrefFor(p.playerSlot)}
              scroll={false}
              aria-current={active ? "true" : undefined}
              aria-label={`${heroName(h, p.heroId)}${p.personaName ? ` (${p.personaName})` : ""}`}
              className={cn(
                "rounded-md p-0.5 ring-1 transition",
                active ? "ring-gold" : "opacity-60 ring-transparent hover:opacity-100",
                p.side === "radiant" ? "bg-win/10" : "bg-loss/10",
              )}
            >
              <HeroPortrait hero={h} heroId={p.heroId} size="xs" />
            </Link>
          );
        })}
      </nav>

      {selected && lines.length > 0 && (
        <>
          {(best || worst) && (
            <p className="text-sm">
              {best && (
                <>
                  Strongest:{" "}
                  <span className="font-medium">{perfLabel(best.stat).toLowerCase()}</span>,{" "}
                  {betterThan(best.pct)} of {hName} games.
                </>
              )}{" "}
              {worst && (
                <>
                  Room to improve:{" "}
                  <span className="font-medium">{perfLabel(worst.stat).toLowerCase()}</span>,{" "}
                  {betterThan(worst.pct)}.
                </>
              )}
            </p>
          )}
          <ul className="space-y-3">
            {lines.map((l) => {
              const pct = Math.round(l.pct * 100);
              return (
                <li key={l.stat} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="text-sm">
                    {perfLabel(l.stat)}{" "}
                    <span className="text-muted-foreground tabular-nums">
                      {formatPerfValue(l.stat, l.raw)}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">
                    {betterThan(l.pct)}
                    {l.pctBracket !== null && ` · ${Math.round(l.pctBracket * 100)}% at this rank`}
                  </span>
                  <span
                    role="img"
                    aria-label={`${perfLabel(l.stat)}: ${betterThan(l.pct)} of ${hName} games`}
                    className="relative col-span-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        pct >= 60 ? "bg-win/80" : pct <= 40 ? "bg-loss/80" : "bg-gold/70",
                      )}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                    <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            The line marks the middle: half of {hName} games do better, half worse. Per-minute stats
            depend on role and game length, so compare like with like.
          </p>
        </>
      )}
    </section>
  );
}
