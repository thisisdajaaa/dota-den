import Link from "next/link";
import { Eye, Radio } from "lucide-react";
import { cn } from "cn";
import type { HeroInfo } from "@/modules/matches/application/ports";
import { HeroPortrait, heroName } from "@/modules/matches/ui/hero-portrait";
import { clock, leadText, type LiveGame, type Side } from "../domain/live-game";

const sideName = (g: LiveGame, s: Side) => g.teams[s] ?? (s === "radiant" ? "Radiant" : "Dire");

export function LineupRow({
  game,
  side,
  heroes,
  names = false,
}: {
  game: LiveGame;
  side: Side;
  heroes: Map<number, HeroInfo>;
  names?: boolean;
}) {
  const players = game.players.filter((p) => p.side === side);
  return (
    <ul className={cn("grid grid-cols-5 gap-1.5", names && "gap-2")}>
      {players.map((p, i) => (
        <li key={i} className="min-w-0 text-center">
          {p.heroId > 0 ? (
            <HeroPortrait hero={heroes.get(p.heroId)} heroId={p.heroId} size="sm" />
          ) : (
            <span
              className="block aspect-[16/9] rounded bg-white/[0.04]"
              aria-label="Not picked yet"
            />
          )}
          {names && (
            <span className="mt-1 block truncate text-[0.7rem]" title={p.name ?? undefined}>
              {p.name ?? "Anonymous"}
              <span className="block truncate text-muted-foreground">
                {p.heroId > 0 ? heroName(heroes.get(p.heroId), p.heroId) : "Picking…"}
              </span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One live game in the list. */
export function LiveGameCard({ game, heroes }: { game: LiveGame; heroes: Map<number, HeroInfo> }) {
  const title = game.leagueId
    ? `${sideName(game, "radiant")} vs ${sideName(game, "dire")}`
    : `Average MMR ${game.averageMmr?.toLocaleString("en-US") ?? "—"}`;
  return (
    <li>
      <Link
        href={`/live/${game.matchId}`}
        aria-label={`${title}: open the live analysis`}
        className="panel block space-y-3 p-4 transition-colors hover:border-gold/30"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="kicker flex items-center gap-1.5">
              <Radio aria-hidden className="size-3 text-loss" />{" "}
              {game.leagueName ?? (game.leagueId ? "League game" : "Public game")}
            </p>
            <p className="truncate font-semibold">{title}</p>
          </div>
          <div className="text-right text-sm tabular-nums">
            <span className="text-win">{game.score.radiant}</span>
            <span className="text-muted-foreground"> – </span>
            <span className="text-loss">{game.score.dire}</span>
            <span className="block text-xs text-muted-foreground">
              {clock(game.gameTimeSec)} · {leadText(game)}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <LineupRow game={game} side="radiant" heroes={heroes} />
          <LineupRow game={game} side="dire" heroes={heroes} />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye aria-hidden className="size-3.5" /> {game.spectators.toLocaleString("en-US")}{" "}
          watching
          {game.delaySec > 0 && ` · feed ${Math.round(game.delaySec / 60)} min behind`}
        </p>
      </Link>
    </li>
  );
}
