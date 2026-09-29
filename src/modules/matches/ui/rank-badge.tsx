import { Star } from "lucide-react";
import { cn } from "cn";
import type { RankTier } from "../domain/rank-tier";

export function RankBadge({ rank }: { rank: RankTier }) {
  const position = rank.leaderboardRank;
  const label = position
    ? `${rank.medal} #${position.toLocaleString("en-US")}`
    : rank.stars
      ? `${rank.medal} ${rank.stars}`
      : rank.medal;
  // Valve's top-100 and top-10 Immortals get distinct medals; echo that with a brighter badge.
  const elite = position !== null && position <= 100;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide text-gold",
        elite
          ? "border-gold/60 bg-gradient-to-b from-gold/35 to-gold/10 shadow-[0_0_16px_-4px_oklch(0.8_0.13_80/0.6)]"
          : "border-gold/30 bg-gradient-to-b from-gold/20 to-gold/5",
      )}
      title={`Rank: ${label}${position ? " on the regional leaderboard (via OpenDota)" : " (via OpenDota)"}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
        <path d="M8 1 14 4v4.5c0 3.2-2.5 5.6-6 6.5-3.5-.9-6-3.3-6-6.5V4l6-3Z" />
      </svg>
      {rank.medal}
      {position !== null && (
        <span className="tabular-nums">#{position.toLocaleString("en-US")}</span>
      )}
      {rank.stars > 0 && (
        <span className="flex" aria-label={`${rank.stars} stars`}>
          {Array.from({ length: rank.stars }, (_, i) => (
            <Star key={i} aria-hidden className="size-2.5 fill-current" />
          ))}
        </span>
      )}
    </span>
  );
}
