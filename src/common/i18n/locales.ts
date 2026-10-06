/** Languages Dota Den speaks (pure, safe in client code). */
export const LOCALES = ["en", "fil", "ceb"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "dd_lang";

/** Each language's name in itself, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fil: "Filipino",
  ceb: "Cebuano",
};

/** BCP 47 tags for <html lang> and Intl formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { en: "en", fil: "fil", ceb: "ceb" };

export const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** The best supported language for an Accept-Language header (Tagalog counts as Filipino). */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const base = tag.split("-")[0];
    if (base === "ceb") return "ceb";
    if (base === "fil" || base === "tl") return "fil";
    if (base === "en") return "en";
  }
  return DEFAULT_LOCALE;
}
