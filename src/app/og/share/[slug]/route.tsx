import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { matchesService } from "@/modules/matches";
import { sharesService } from "@/modules/shares";

const size = OG_SIZE;

/** Link preview for a share: the record, win rate and the heroes played. English only. */
async function render(slug: string) {
  const [share, heroes] = await Promise.all([sharesService.view(slug), matchesService.heroMap()]);
  // A removed or unknown link has no preview.
  if (!share) return null;
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

/** GET /og/share/:slug: the share preview. Pages add ?v= (last update) so a refreshed share gets a new image. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const image = await render((await params).slug);
  if (!image) return new Response(null, { status: 404 });
  image.headers.set("cache-control", "public, max-age=300, s-maxage=3600");
  return image;
}
