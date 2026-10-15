import Image from "next/image";
import { cn } from "cn";
import { MEDALS, type RankTier } from "../domain/rank-tier";

/**
 * Valve's medal art (via OpenDota, ~45 KB PNGs) resized by /img/rank/{name}-{width}.webp.
 * Widths 64, 128 and 256 cover shown sizes up to 128 px at 2×.
 */
export const RANK_IMAGE_WIDTHS = [64, 128, 256] as const;

function rankImage(name: string, size: number): string {
  const width = RANK_IMAGE_WIDTHS.find((w) => w >= size * 2) ?? 256;
  return `/img/rank/${name}-${width}.webp`;
}

function medalImage(rank: RankTier, size: number): string {
  const tier = MEDALS.indexOf(rank.medal) + 1;
  if (rank.medal === "Immortal" && rank.leaderboardRank !== null) {
    // Valve's distinct medals for the top 10 and top 100.
    if (rank.leaderboardRank <= 10) return rankImage("rank_icon_8c", size);
    if (rank.leaderboardRank <= 100) return rankImage("rank_icon_8b", size);
  }
  return rankImage(`rank_icon_${tier}`, size);
}

export function rankLabel(rank: RankTier): string {
  if (rank.leaderboardRank) return `${rank.medal} #${rank.leaderboardRank.toLocaleString("en-US")}`;
  return rank.stars ? `${rank.medal} ${rank.stars}` : rank.medal;
}

/**
 * The in-game rank medal: base art, star overlay (Herald–Divine) and, for Immortal,
 * the leaderboard position printed on the plaque like the client does.
 */
export function RankMedal({
  rank,
  size = 96,
  className,
}: {
  rank: RankTier;
  size?: number;
  className?: string;
}) {
  const label = rankLabel(rank);
  const showNumber = rank.medal === "Immortal" && rank.leaderboardRank !== null && size >= 48;
  return (
    <span
      role="img"
      aria-label={label}
      title={`${label} (via OpenDota)`}
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src={medalImage(rank, size)}
        alt=""
        width={size}
        height={size}
        className="absolute inset-0 size-full object-contain"
      />
      {rank.stars > 0 && (
        <Image
          src={rankImage(`rank_star_${rank.stars}`, size)}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 size-full object-contain"
        />
      )}
      {showNumber && (
        <span
          aria-hidden
          className="absolute inset-x-0 text-center font-semibold text-[oklch(0.95_0.03_85)] tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]"
          style={{ top: "76%", fontSize: Math.max(9, size * 0.13), lineHeight: 1 }}
        >
          {rank.leaderboardRank!.toLocaleString("en-US")}
        </span>
      )}
    </span>
  );
}
