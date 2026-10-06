import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "./locales";
import { englishMessages, MESSAGES, type Messages } from "./messages";
import { translator, type Translator } from "./translate";

/** The viewer's language: their saved choice (cookie), else their browser's, else English. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

/** A translator for the viewer's language (server components and route handlers). */
export async function getT(): Promise<Translator<Messages>> {
  return translator(MESSAGES[await getLocale()], englishMessages);
}
