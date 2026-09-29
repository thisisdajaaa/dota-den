import { Star } from "lucide-react";
import type { RankTier } from "../domain/rank-tier";

export function RankBadge({ rank }: { rank: RankTier }) {
  const label = rank.stars ? `${rank.medal} ${rank.stars}` : rank.medal;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gradient-to-b from-gold/20 to-gold/5 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-gold"
      title={`OpenDota rank tier: ${label}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
        <path d="M8 1 14 4v4.5c0 3.2-2.5 5.6-6 6.5-3.5-.9-6-3.3-6-6.5V4l6-3Z" />
      </svg>
      {rank.medal}
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
