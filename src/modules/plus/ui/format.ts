import { LOCALE_TAGS, type Locale } from "@/common/i18n/locales";

/**
 * A billing date ("Nov 23, 2026") in the viewer's language. Formatted in UTC so the server and
 * the browser render the same text (a day boundary is close enough for a period end).
 */
export function formatBillingDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}
