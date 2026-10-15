import sharp from "sharp";
import { HERO_THUMB_WIDTHS } from "@/modules/matches/ui/hero-image";

const FILE = /^([a-z0-9_]+)-(\d{2,3})\.webp$/;
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

/**
 * GET /img/hero/{name}-{width}.webp: a hero portrait from Steam's CDN, resized. Only hero
 * names and the listed widths are accepted, so this can't fetch anything else. Hero art
 * rarely changes: cached for a month by the CDN, a week in browsers.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  const width = Number(m?.[2]);
  if (!m || !(HERO_THUMB_WIDTHS as readonly number[]).includes(width))
    return new Response(null, { status: 404 });
  const upstream = await fetch(`${CDN}/${m[1]}.png`, { signal: AbortSignal.timeout(8000) }).catch(
    () => null,
  );
  if (!upstream?.ok) return new Response(null, { status: upstream?.status === 404 ? 404 : 502 });
  const image = await sharp(Buffer.from(await upstream.arrayBuffer()))
    .resize({ width })
    .webp({ quality: 78 })
    .toBuffer();
  return new Response(new Uint8Array(image), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
    },
  });
}
