import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage } from "@/common/i18n/locales";
import { englishMessages, MESSAGES } from "@/common/i18n/messages";
import { translator } from "@/common/i18n/translate";

describe("i18n", () => {
  it("picks the best supported language from the browser, Tagalog counting as Filipino", () => {
    expect(localeFromAcceptLanguage("ceb-PH,en;q=0.8")).toBe("ceb");
    expect(localeFromAcceptLanguage("tl-PH,en;q=0.9")).toBe("fil");
    expect(localeFromAcceptLanguage("en-US,fil;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage("ja,fil;q=0.4")).toBe("fil");
    expect(localeFromAcceptLanguage("ja,ko")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("translates, fills placeholders and falls back to English, then the key", () => {
    const t = translator(MESSAGES.ceb, englishMessages);
    expect(t("common.nav.matches")).toBe("Mga duwa");
    const fill = translator<typeof englishMessages>(
      {
        common: { ...MESSAGES.en.common, nav: { ...MESSAGES.en.common.nav, matches: "{n} games" } },
      } as never,
      englishMessages,
    );
    expect(fill("common.nav.matches", { n: 3 })).toBe("3 games");
    const fallsBack = translator<typeof englishMessages>({} as never, englishMessages);
    expect(fallsBack("common.nav.matches")).toBe("Matches");
    const bare = translator<typeof englishMessages>({} as never, {} as never);
    expect(bare("common.nav.matches")).toBe("common.nav.matches");
  });

  it("every language has every key (no English left by accident in leaves that differ)", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "string" ? [`${p}${k}`] : keys(v as object, `${p}${k}.`),
      );
    const en = keys(MESSAGES.en).sort();
    expect(keys(MESSAGES.fil).sort()).toEqual(en);
    expect(keys(MESSAGES.ceb).sort()).toEqual(en);
  });
});
