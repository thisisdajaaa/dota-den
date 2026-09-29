import Image from "next/image";
import { cn } from "cn";
import { MEDALS, type RankTier } from "../domain/rank-tier";

const BASE = "https://www.opendota.com/assets/images/dota2/rank_icons";

function medalImage(rank: RankTier): string {
  const tier = MEDALS.indexOf(rank.medal) + 1;
  if (rank.medal === "Immortal" && rank.leaderboardRank !== null) {
    // Valve's distinct medals for the top 10 and top 100.
    if (rank.leaderboardRank <= 10) return `${BASE}/rank_icon_8c.png`;
    if (rank.leaderboardRank <= 100) return `${BASE}/rank_icon_8b.png`;
  }
  return `${BASE}/rank_icon_${tier}.png`;
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
      <Image src={medalImage(rank)} alt="" fill sizes={`${size}px`} className="object-contain" />
      {rank.stars > 0 && (
        <Image
          src={`${BASE}/rank_star_${rank.stars}.png`}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-contain"
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
