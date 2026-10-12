import Link from "next/link";
import { Link2Off } from "lucide-react";
import { getT } from "@/common/i18n/server";

export default async function ShareNotFound() {
  const t = await getT();
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <Link2Off aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{t("shares.notFound.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("shares.notFound.body")}</p>
      <Link href="/" className="text-sm text-gold hover:underline">
        {t("shares.cta.action")}
      </Link>
    </section>
  );
}
