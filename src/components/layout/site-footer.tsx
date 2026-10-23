"use client";

import Link from "next/link";
import { useT } from "@/common/i18n/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandMark } from "./brand-mark";

export function SiteFooter({ showPlus = false }: { showPlus?: boolean }) {
  const t = useT();
  return (
    <footer className="mt-auto border-t border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-start sm:px-6">
        <BrandMark className="size-6 shrink-0 opacity-60 grayscale" />
        <div className="max-w-3xl flex-1 space-y-2">
          <p className="leading-relaxed">{t("common.footer.disclaimer")}</p>
          <nav aria-label={t("common.footer.legal")} className="flex flex-wrap gap-x-4 gap-y-1">
            {showPlus && (
              <Link
                href="/plus"
                className="relative hover:text-foreground hover:underline touch:tap-area"
              >
                {t("common.nav.plus")}
              </Link>
            )}
            <Link
              href="/terms"
              className="relative hover:text-foreground hover:underline touch:tap-area"
            >
              {t("common.footer.terms")}
            </Link>
            <Link
              href="/refunds"
              className="relative hover:text-foreground hover:underline touch:tap-area"
            >
              {t("common.footer.refunds")}
            </Link>
          </nav>
        </div>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
