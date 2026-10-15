import { env } from "@/common/config/env";
import { RANK_IMAGE_WIDTHS } from "@/modules/matches/ui/rank-medal";
import { resizedImage } from "../../resize";

const FILE = /^(rank_icon_(?:[0-8]|8b|8c)|rank_star_[1-7])-(\d{2,3})\.webp$/;
const SOURCE = "https://www.opendota.com/assets/images/dota2/rank_icons";

/**
 * GET /img/rank/{name}-{width}.webp: a rank medal or star layer, resized. Only the known
 * medal file names and listed widths are accepted.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = FILE.exec((await params).file);
  const width = Number(m?.[2]);
  if (!m || !(RANK_IMAGE_WIDTHS as readonly number[]).includes(width))
    return new Response(null, { status: 404 });
  const base = env().IMAGE_SOURCE_BASE_URL;
  return resizedImage(base ? `${base}/rank/${m[1]}.png` : `${SOURCE}/${m[1]}.png`, width, 80);
}
