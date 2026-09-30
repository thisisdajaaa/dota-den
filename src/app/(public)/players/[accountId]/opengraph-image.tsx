import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame } from "@/components/og/og-frame";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { rankLabel } from "@/modules/matches/ui/rank-medal";
import { getPlayerProfile } from "@/modules/matches/composition";
import { getPlayerDirectory } from "@/modules/players/composition";
import { parseAccountId } from "@/modules/players/domain/player-lookup";

export const alt = "Dota 2 player on Dota Den";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Link preview for a player: avatar, name, rank, and public record. */
export default async function Image({ params }: { params: Promise<{ accountId: string }> }) {
  const id = parseAccountId((await params).accountId);
  const [profile, record] = id
    ? await Promise.all([getPlayerProfile(id), getPlayerDirectory().winLoss(id)])
    : [null, null];
  const name = profile?.personaName ?? (id ? `Player ${id}` : "Player");
  const rank = parseRankTier(profile?.rankTier, profile?.leaderboardRank);
  const rankText = rank ? rankLabel(rank) : "Unranked";
  const wl = record?.ok ? record.value : null;
  const games = wl ? wl.wins + wl.losses : 0;
  const avatar = profile?.avatarUrl?.startsWith("https://avatars.steamstatic.com/")
    ? profile.avatarUrl
    : null;
  return new ImageResponse(
    <OgFrame kicker="Player profile">
      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        {avatar ? (
          <img
            alt=""
            src={avatar}
            width={220}
            height={220}
            style={{ borderRadius: 28, border: `3px solid ${OG.gold}` }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 220,
              height: 220,
              borderRadius: 28,
              background: OG.panel,
            }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 34, color: OG.gold, marginTop: 10 }}>
            {rankText}
          </div>
          {games > 0 && (
            <div style={{ display: "flex", fontSize: 30, color: OG.muted, marginTop: 18 }}>
              {((wl!.wins / games) * 100).toFixed(1)}% win rate · {games.toLocaleString("en-US")}{" "}
              public games
            </div>
          )}
        </div>
      </div>
    </OgFrame>,
    size,
  );
}
