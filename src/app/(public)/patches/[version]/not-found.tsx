import Link from "next/link";
import { SearchX } from "lucide-react";
import { getT } from "@/common/i18n/server";

export default async function PatchNotFound() {
  const t = await getT();
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{t("patches.notFound.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("patches.notFound.body")}</p>
      <Link href="/patches" className="text-sm text-gold hover:underline">
        {t("patches.notFound.seeAll")}
      </Link>
    </section>
  );
}
