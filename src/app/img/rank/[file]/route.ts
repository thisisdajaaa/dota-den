import sharp from "sharp";
import { RANK_IMAGE_WIDTHS } from "@/modules/matches/ui/rank-medal";

const FILE = /^(rank_icon_(?:[0-8]|8b|8c)|rank_star_[1-7])-(\d{2,3})\.webp$/;
const SOURCE = "https://www.opendota.com/assets/images/dota2/rank_icons";

/**
 * GET /img/rank/{name}-{width}.webp: a rank medal or star layer, resized. Only the known
 * medal file names and listed widths are accepted. The art doesn't change: cached long.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  const width = Number(m?.[2]);
  if (!m || !(RANK_IMAGE_WIDTHS as readonly number[]).includes(width))
    return new Response(null, { status: 404 });
  const upstream = await fetch(`${SOURCE}/${m[1]}.png`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!upstream?.ok) return new Response(null, { status: upstream?.status === 404 ? 404 : 502 });
  const image = await sharp(Buffer.from(await upstream.arrayBuffer()))
    .resize({ width })
    .webp({ quality: 80 })
    .toBuffer();
  return new Response(new Uint8Array(image), {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
    },
  });
}
