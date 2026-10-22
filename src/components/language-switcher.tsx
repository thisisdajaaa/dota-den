"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/common/http/api-client";
import { useLocale, useT } from "@/common/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/common/i18n/locales";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Languages aria-hidden className="size-3.5" />
      <Select value={locale} disabled={pending} onValueChange={(v) => void choose(v as Locale)}>
        <SelectTrigger
          size="sm"
          aria-label={t("common.language.label")}
          className="min-w-28 border-white/10 bg-background text-xs text-foreground"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((l) => (
            <SelectItem key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
