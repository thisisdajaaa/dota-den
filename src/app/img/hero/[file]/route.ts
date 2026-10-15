import { env } from "@/common/config/env";
import { HERO_THUMB_WIDTHS } from "@/modules/matches/ui/hero-image";
import { resizedImage } from "../../resize";

const FILE = /^([a-z0-9_]+)-(\d{2,3})\.webp$/;
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

/**
 * GET /img/hero/{name}-{width}.webp: a hero portrait from Steam's CDN, resized. Only hero
 * names and the listed widths are accepted, so this can't fetch anything else.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  const width = Number(m?.[2]);
  if (!m || !(HERO_THUMB_WIDTHS as readonly number[]).includes(width))
    return new Response(null, { status: 404 });
  const base = env().IMAGE_SOURCE_BASE_URL;
  return resizedImage(base ? `${base}/hero/${m[1]}.png` : `${CDN}/${m[1]}.png`, width, 78);
}
