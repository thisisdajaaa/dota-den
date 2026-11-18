import { ImageResponse } from "next/og";
import { isLocale } from "@/common/i18n/locales";
import { englishMessages, MESSAGES } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";
import { ogFonts } from "@/components/og/og-fonts";
import { matchesService } from "@/modules/matches";
import { heroName } from "@/modules/matches/ui/hero-portrait";
import { sharesService } from "@/modules/shares";
import { CARD_SIZES, isCardFormat } from "@/modules/shares/domain/share-card";
import { cardHeroIds, cardVisual, ShareCardImage } from "@/modules/shares/ui/share-card-image";
import { shareCardText } from "@/modules/shares/ui/share-card-text";

/**
 * GET /og/share/:slug: the share card. `?lang=` (en, fil, ceb; default en) picks its language,
 * `?format=square` the 1080×1080 post size (default: the 1200×630 link preview), and
 * `?download=1` saves it as a file. Pages add `?v=` (last update) so a refreshed share gets a
 * new image.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const query = new URL(req.url).searchParams;
  const lang = query.get("lang");
  const locale = isLocale(lang) ? lang : "en";
  const formatParam = query.get("format");
  const format = isCardFormat(formatParam) ? formatParam : "wide";

  const [share, heroes, fonts] = await Promise.all([
    sharesService.view(slug),
    matchesService.heroMap(),
    ogFonts(),
  ]);
  // A removed or unknown link has no card.
  if (!share) return new Response(null, { status: 404 });

  const t = translator(MESSAGES[locale], englishMessages);
  const s = share.snapshot;
  const text = shareCardText(t, s, {
    playerName: share.playerName,
    heroName: (id) => heroName(heroes.get(id), id),
  });
  const image = (id: number) => heroes.get(id)?.imageUrl ?? null;
  const visual = cardVisual(s, image, s.kind === "match" ? t(`shares.match.${s.result}`) : "");

  const response = new ImageResponse(
    <ShareCardImage
      text={text}
      format={format}
      playerName={share.playerName ?? t("shares.aPlayer")}
      visual={visual}
      heroImages={cardHeroIds(s).map(image)}
    />,
    { ...CARD_SIZES[format], fonts },
  );
  response.headers.set("cache-control", "public, max-age=300, s-maxage=3600");
  if (query.get("download") === "1")
    response.headers.set(
      "content-disposition",
      `attachment; filename="dota-den-${s.kind}-${format}-${locale}.png"`,
    );
  return response;
}
