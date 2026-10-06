import Link from "next/link";
import { getT } from "@/common/i18n/server";

/** Shown to anyone who isn't an admin: the page doesn't exist as far as they're concerned. */
export default async function AdminNotFound() {
  const t = await getT();
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">{t("admin.notFound.title")}</h1>
      <Link href="/dashboard" className="text-sm text-gold hover:underline">
        {t("admin.notFound.back")}
      </Link>
    </section>
  );
}
