import Link from "next/link";
import { SearchX } from "lucide-react";
import { getT } from "@/common/i18n/server";

export default async function HeroNotFound() {
  const t = await getT();
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{t("heroes.notFound.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("heroes.notFound.body")}</p>
      <Link href="/heroes" className="text-sm text-gold hover:underline">
        {t("heroes.notFound.back")}
      </Link>
    </section>
  );
}
