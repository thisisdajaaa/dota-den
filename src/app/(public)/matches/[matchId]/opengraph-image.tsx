import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { matchesService } from "@/modules/matches";

export const alt = "Dota 2 match on Dota Den";
export const size = OG_SIZE;
export const contentType = "image/png";

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Link preview for a match: result, score, length and both lineups. */
export default async function Image({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const [res, heroes] = await Promise.all([
    /^\d{1,20}$/.test(matchId) ? matchesService.match(matchId) : null,
    matchesService.heroMap(),
  ]);
  if (!res?.ok) {
    return new ImageResponse(
      <OgFrame kicker="Match">
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>Match {matchId}</div>
      </OgFrame>,
      size,
    );
  }
  const m = res.value;
  const team = (side: "radiant" | "dire") =>
    m.players.filter((p) => p.side === side).map((p) => heroes.get(p.heroId)?.imageUrl ?? null);
  const row = (side: "radiant" | "dire", won: boolean, score: number) => (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div
        style={{
          display: "flex",
          width: 150,
          flexShrink: 0,
          fontSize: 30,
          fontWeight: 700,
          color: side === "radiant" ? OG.win : OG.loss,
        }}
      >
        {side === "radiant" ? "Radiant" : "Dire"}
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {team(side).map((src, i) => (
          <OgHero key={i} src={src} size={136} />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          marginLeft: "auto",
          width: 150,
          flexShrink: 0,
          justifyContent: "flex-end",
          alignItems: "baseline",
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        {score}
        {won && <span style={{ fontSize: 22, color: OG.gold, marginLeft: 12 }}>WIN</span>}
      </div>
    </div>
  );
  return new ImageResponse(
    <OgFrame kicker={`Match ${matchId}`}>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>
        {m.radiantWin ? "Radiant" : "Dire"} victory
      </div>
      <div style={{ display: "flex", fontSize: 28, color: OG.muted, marginTop: 8 }}>
        {duration(m.durationSec)} · {m.startedAt.toISOString().slice(0, 10)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 44 }}>
        {row("radiant", m.radiantWin, m.radiantScore)}
        {row("dire", !m.radiantWin, m.direScore)}
      </div>
    </OgFrame>,
    size,
  );
}
