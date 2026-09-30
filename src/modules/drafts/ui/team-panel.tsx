import Image from "next/image";
import { cn } from "cn";
import { POSITION_NAMES, type Position } from "../domain/draft-positions";
import type { DraftSelection, Side } from "../domain/draft-state";
import type { DraftHero } from "./types";

function Slot({
  hero,
  active,
  kind,
  position,
}: {
  hero: DraftHero | undefined;
  active: boolean;
  kind: "pick" | "ban";
  /** Where this pick plays in the lineup, when known. */
  position?: Position;
}) {
  const pick = kind === "pick";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-black/40 ring-1 ring-white/[0.07]",
        pick ? "aspect-[16/9]" : "aspect-[16/9] opacity-80",
        active &&
          "shadow-[0_0_20px_-4px_oklch(0.8_0.13_80/0.7)] ring-2 ring-gold motion-safe:animate-pulse",
      )}
    >
      {hero?.imageUrl && (
        <Image
          src={hero.imageUrl}
          alt=""
          fill
          sizes={pick ? "160px" : "80px"}
          className={cn("object-cover", !pick && "grayscale")}
        />
      )}
      {hero && !pick && (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <span className="h-0.5 w-[120%] rotate-[-20deg] bg-loss/80" />
        </span>
      )}
      {hero && pick && position && (
        <span
          className="absolute top-1 left-1 rounded bg-black/75 px-1 text-[0.6rem] font-semibold text-gold ring-1 ring-gold/30"
          title={`Position ${position}: ${POSITION_NAMES[position]}`}
        >
          <span aria-hidden>P{position}</span>
          <span className="sr-only">
            Position {position}, {POSITION_NAMES[position]}
          </span>
        </span>
      )}
      {hero && pick && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-1.5 pt-3 pb-0.5 text-[0.65rem] font-semibold">
          {hero.name}
        </span>
      )}
    </div>
  );
}

export function TeamPanel({
  side,
  picks,
  bans,
  heroes,
  totalPicks,
  totalBans,
  activeAction,
  isFirst,
  reserveLabel,
  controller,
  captainName,
  positions,
}: {
  side: Side;
  picks: readonly DraftSelection[];
  bans: readonly DraftSelection[];
  heroes: Map<number, DraftHero>;
  totalPicks: number;
  totalBans: number;
  activeAction: "pick" | "ban" | null;
  isFirst: boolean;
  reserveLabel: string | null;
  /** Who drafts this side in a vs-AI game. */
  controller?: "you" | "ai";
  /** Multiplayer: the captain drafting this side. */
  captainName?: string | null;
  /** Where each picked hero plays (from the draft outlook), by hero id. */
  positions?: ReadonlyMap<number, Position>;
}) {
  const radiant = side === "radiant";
  return (
    <section
      aria-label={`${radiant ? "Radiant" : "Dire"} draft`}
      className={cn(
        "panel space-y-3 p-4",
        activeAction && (radiant ? "border-win/40" : "border-loss/40"),
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("h-5 w-1 rounded-full", radiant ? "bg-win" : "bg-loss")}
          />
          <h2 className="font-display text-lg font-bold tracking-wider">
            {radiant ? "Radiant" : "Dire"}
          </h2>
          {controller && (
            <span
              className={cn(
                "rounded px-1.5 text-[0.6rem] font-semibold tracking-wider uppercase",
                controller === "you" ? "bg-gold/15 text-gold" : "bg-white/10 text-foreground",
              )}
            >
              {controller === "you" ? "You" : "AI"}
            </span>
          )}
          {captainName && (
            <span className="max-w-32 truncate text-xs text-muted-foreground" title={captainName}>
              {captainName}
            </span>
          )}
          {isFirst && (
            <span className="rounded border border-white/15 px-1.5 text-[0.6rem] tracking-wider text-muted-foreground uppercase">
              First pick
            </span>
          )}
        </div>
        {reserveLabel && (
          <span className="text-xs text-muted-foreground tabular-nums" title="Reserve time left">
            Reserve {reserveLabel}
          </span>
        )}
      </header>
      <div>
        <div className="mb-1 text-[0.65rem] tracking-wider text-muted-foreground uppercase">
          Picks
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: totalPicks }, (_, i) => (
            <Slot
              key={i}
              kind="pick"
              hero={picks[i] ? heroes.get(picks[i].heroId) : undefined}
              active={activeAction === "pick" && i === picks.length}
              position={picks[i]?.heroId != null ? positions?.get(picks[i].heroId) : undefined}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[0.65rem] tracking-wider text-muted-foreground uppercase">
          Bans
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: totalBans }, (_, i) => (
            <Slot
              key={i}
              kind="ban"
              hero={bans[i] ? heroes.get(bans[i].heroId) : undefined}
              active={activeAction === "ban" && i === bans.length}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
