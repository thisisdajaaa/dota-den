import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { matchesService } from "@/modules/matches";
import { parseRankTier } from "@/modules/matches/domain/rank-tier";
import { rankLabel } from "@/modules/matches/ui/rank-medal";
import { medalStep } from "@/modules/mmr/domain/journey";
import { sharesService } from "@/modules/shares";
import type { JourneyShare } from "@/modules/shares/domain/share";

const size = OG_SIZE;

const medalName = (tier: number) => {
  const r = parseRankTier(tier);
  return r ? rankLabel(r) : `Rank ${tier}`;
};

const CHART = { width: 1072, height: 130 };

/** A rank journey preview: the medal step line, first and latest medal, and the best climb. */
function renderJourney(
  s: JourneyShare,
  playerName: string | null,
  heroes: Awaited<ReturnType<typeof matchesService.heroMap>>,
) {
  const first = s.medals[0];
  const last = s.medals.at(-1)!;
  const from = s.from.getTime();
  const span = Math.max(s.to.getTime() - from, 86_400_000);
  const steps = s.medals.map((m) => medalStep(m.rankTier));
  const lo = Math.min(...steps) - 1;
  const hi = Math.max(...steps) + 1;
  const x = (t: number) => ((Math.min(Math.max(t, from), from + span) - from) / span) * CHART.width;
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (CHART.height - 20);
  const end = Math.min(s.lastSeenAt?.getTime() ?? from + span, from + span);
  let d = "";
  s.medals.forEach((m, i) => {
    d += i === 0 ? `M${x(m.at.getTime())},${y(steps[i])}` : `V${y(steps[i])}`;
    d += `H${x(Math.max(s.medals[i + 1]?.at.getTime() ?? end, m.at.getTime()))}`;
  });
  const climb = s.climb;
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const heroIds = s.heroes.map((h) => h.heroId).slice(0, 5);
  return new ImageResponse(
    <OgFrame kicker="Rank journey">
      <div style={{ display: "flex", fontSize: 36, color: OG.muted }}>
        {playerName ?? "A player"}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 4 }}>
        <span style={{ fontSize: 72, fontWeight: 700 }}>
          {first === last
            ? medalName(last.rankTier)
            : `${medalName(first.rankTier)} → ${medalName(last.rankTier)}`}
        </span>
      </div>
      <div style={{ display: "flex", fontSize: 30, color: climb ? OG.win : OG.muted }}>
        {climb
          ? `Best climb: +${climb.steps} star${climb.steps === 1 ? "" : "s"} (${day.format(climb.from)} – ${day.format(climb.to)})`
          : "Medal journey"}
      </div>
      <div style={{ display: "flex", marginTop: 16 }}>
        <svg
          width={CHART.width}
          height={CHART.height}
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        >
          <path d={d} fill="none" stroke={OG.gold} strokeWidth={6} strokeLinejoin="round" />
          <circle cx={x(last.at.getTime())} cy={y(steps.at(-1)!)} r={9} fill={OG.gold} />
        </svg>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
        {heroIds.map((id) => (
          <OgHero key={id} src={heroes.get(id)?.imageUrl ?? null} size={96} />
        ))}
      </div>
    </OgFrame>,
    size,
  );
}

/** Link preview for a share: the record, win rate and the heroes played. English only. */
async function render(slug: string) {
  const [share, heroes] = await Promise.all([sharesService.view(slug), matchesService.heroMap()]);
  // A removed or unknown link has no preview.
  if (!share) return null;
  const s = share.snapshot;
  if (s.kind === "journey") return renderJourney(s, share.playerName, heroes);
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
