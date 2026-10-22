import { ImageResponse } from "next/og";
import { clientKey, rateLimit } from "@/common/http/rate-limit";
import { asGuestWork } from "@/common/providers/background-work";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { matchesService } from "@/modules/matches";

const size = OG_SIZE;

/** Per client IP. Real previews come from a CDN cache; this stops id-walking crawlers. */
const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Link preview for a match: result, score, length and both lineups. */
async function render(matchId: string) {
  const [res, heroes] = await Promise.all([
    /^\d{1,20}$/.test(matchId) ? matchesService.match(matchId) : null,
    matchesService.heroMap(),
  ]);
  if (!res?.ok) {
    // OpenDota may just be busy: cache this placeholder briefly, not like a real preview.
    const image = new ImageResponse(
      <OgFrame kicker="Match">
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>Match {matchId}</div>
      </OgFrame>,
      size,
    );
    return { image, found: false };
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
  const image = new ImageResponse(
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
  return { image, found: true };
}

/**
 * GET /og/match/:matchId: the match preview at a stable URL (page metadata, Discord posts).
 * Finished matches don't change, so it's cached for a week. Mostly fetched by link-preview
 * bots, so its OpenDota calls always use the guest share of the budget.
 */
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { limit, windowMs } = RATE_LIMIT;
  if (!(await rateLimit(`og-match:${clientKey(req)}`, limit, windowMs)))
    return new Response("Too many requests", {
      status: 429,
      headers: { "retry-after": String(windowMs / 1000), "cache-control": "no-store" },
    });
  const matchId = (await params).matchId;
  const { image, found } = await asGuestWork(() => render(matchId));
  image.headers.set(
    "cache-control",
    found
      ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400"
      : "public, max-age=60, s-maxage=300",
  );
  return image;
}
