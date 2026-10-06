"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/common/http/api-client";
import { useLocale, useT } from "@/common/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/common/i18n/locales";

/** Pick the UI language; saved on this device and, signed in, on your account. */
export function LanguageSwitcher() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function choose(next: Locale) {
    if (next === locale) return;
    try {
      await apiRequest("/api/v1/me/settings/language", { method: "PUT", body: { language: next } });
      startTransition(() => router.refresh());
    } catch {
      toast.error(t("common.errors.generic"));
    }
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Languages aria-hidden className="size-3.5" />
      <span className="sr-only">{t("common.language.label")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => void choose(e.target.value as Locale)}
        className="rounded-md border border-white/10 bg-background px-1.5 py-1 text-xs text-foreground"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
