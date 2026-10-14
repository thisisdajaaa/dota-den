import Link from "next/link";
import { SearchX } from "lucide-react";
import { getT } from "@/common/i18n/server";

export default async function GroupNotFound() {
  const t = await getT();
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <SearchX aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{t("groups.group.notFoundTitle")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("groups.group.notFoundBody")}</p>
      <Link href="/groups" className="text-sm text-gold hover:underline">
        {t("groups.group.notFoundBack")}
      </Link>
    </section>
  );
}
