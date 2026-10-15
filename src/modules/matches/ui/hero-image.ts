/**
 * Hero portraits are 256×144 PNGs (~60 KB) on Steam's CDN but shown at 40–140 CSS px.
 * /img/hero/{name}-{width}.webp serves them resized (~2–4 KB) and cached by the CDN.
 */
export const HERO_THUMB_WIDTHS = [96, 128, 200, 300] as const;
export type HeroThumbWidth = (typeof HERO_THUMB_WIDTHS)[number];

const STEAM_HERO = /\/apps\/dota2\/images\/dota_react\/heroes\/([a-z0-9_]+)\.png$/;

/** Our resized copy for a portrait shown `cssWidth` px wide (2× for sharp screens). */
export function heroThumb(imageUrl: string, cssWidth: number): string {
  const name = STEAM_HERO.exec(imageUrl.split("?")[0])?.[1];
  if (!name) return imageUrl;
  const want = cssWidth * 2;
  const width = HERO_THUMB_WIDTHS.find((w) => w >= want) ?? HERO_THUMB_WIDTHS.at(-1)!;
  return `/img/hero/${name}-${width}.webp`;
}
