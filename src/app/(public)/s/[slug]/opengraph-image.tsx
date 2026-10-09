import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { matchesService } from "@/modules/matches";
import { sharesService } from "@/modules/shares";

export const alt = "A shared Dota 2 session or week on Dota Den";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Link preview for a share: the record, win rate and the heroes played. English only. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [share, heroes] = await Promise.all([sharesService.view(slug), matchesService.heroMap()]);
  if (!share) {
    return new ImageResponse(
      <OgFrame kicker="Shared">
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>Link not found</div>
      </OgFrame>,
      size,
    );
  }
  const s = share.snapshot;
  const heroIds =
    s.kind === "session"
      ? s.heroes.map((h) => h.heroId)
      : [s.mostPlayed?.heroId, s.best?.heroId].filter((id): id is number => id != null);
  const unique = [...new Set(heroIds)].slice(0, 5);
  const rate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : null;
  return new ImageResponse(
    <OgFrame kicker={s.kind === "session" ? "Session" : "Week"}>
      <div style={{ display: "flex", fontSize: 40, color: OG.muted }}>
        {share.playerName ?? "A player"}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 8 }}>
        <span style={{ fontSize: 120, fontWeight: 700, color: OG.win }}>{s.wins}W</span>
        <span style={{ fontSize: 120, fontWeight: 700, color: OG.loss }}>{s.losses}L</span>
        {rate !== null && (
          <span style={{ fontSize: 40, color: OG.muted, marginLeft: 16 }}>{rate}% wins</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: "auto" }}>
        {unique.map((id) => (
          <OgHero key={id} src={heroes.get(id)?.imageUrl ?? null} size={180} />
        ))}
      </div>
    </OgFrame>,
    size,
  );
}
