import { getT } from "@/common/i18n/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BrandMark } from "./brand-mark";

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="mt-auto border-t border-white/[0.06]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-start sm:px-6">
        <BrandMark className="size-6 shrink-0 opacity-60 grayscale" />
        <p className="max-w-3xl flex-1 leading-relaxed">{t("common.footer.disclaimer")}</p>
        <LanguageSwitcher />
      </div>
    </footer>
  );
}
