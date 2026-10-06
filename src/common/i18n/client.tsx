"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./locales";
import type { Messages } from "./messages";
import { translator, type MessageTree, type Translator } from "./translate";

const I18nContext = createContext<{ locale: Locale; t: Translator<Messages> } | null>(null);

/** Gives client components the viewer's language (set once in the root layout). */
export function I18nProvider({
  locale,
  messages,
  fallback,
  children,
}: {
  locale: Locale;
  messages: MessageTree<Messages>;
  fallback: Messages;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: translator(messages, fallback) }),
    [locale, messages, fallback],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translator<Messages> {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT needs an I18nProvider");
  return ctx.t;
}

export function useLocale(): Locale {
  return useContext(I18nContext)?.locale ?? "en";
}
