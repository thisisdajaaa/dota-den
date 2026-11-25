import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgFrame, OgHero } from "@/components/og/og-frame";
import { matchesService } from "@/modules/matches";

export const alt = "Dota 2 hero guide on Dota Den";
export const size = OG_SIZE;
export const contentType = "image/png";

const HERO_ID = /^[1-9]\d{0,3}$/;
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/";

/**
 * The hero's full-size render as a data URL, or null: it's big (about 1.5 MB), so it gets a
 * short timeout and the preview falls back to the small portrait rather than failing.
 */
async function render(url: string | null): Promise<string | null> {
  if (!url?.startsWith(STEAM_CDN)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok || res.headers.get("content-type") !== "image/png") return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Link preview for a hero guide: the hero, its name, and what the guide covers. */
export default async function Image({ params }: { params: Promise<{ heroId: string }> }) {
  const { heroId } = await params;
  const hero = HERO_ID.test(heroId)
    ? await matchesService
        .heroMap()
        .then((m) => m.get(Number(heroId)))
        .catch(() => undefined)
    : undefined;
  const art = await render(hero?.renderUrl ?? null);
  return new ImageResponse(
    <OgFrame kicker="Hero guide">
      <div
        style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 600 }}>
          {!art && hero && (
            <div style={{ display: "flex", marginBottom: 28 }}>
              <OgHero src={hero.imageUrl} size={256} />
            </div>
          )}
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
            {hero?.name ?? "Hero guides"}
          </div>
          <div style={{ display: "flex", fontSize: 32, color: OG.gold, marginTop: 18 }}>
            Pro item builds · skills · ward spots
          </div>
          <div style={{ display: "flex", fontSize: 26, color: OG.muted, marginTop: 14 }}>
            From recent high-rank and pro games
          </div>
        </div>
        {art && (
          <img
            alt=""
            src={art}
            width={500}
            height={500}
            style={{ marginRight: -40, objectFit: "contain" }}
          />
        )}
      </div>
    </OgFrame>,
    size,
  );
}
