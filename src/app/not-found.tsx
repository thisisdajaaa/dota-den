import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("system.notFound.pageTitle") };
}

/** 404 for unknown URLs, in the app's own look instead of Next's default white page. */
export default async function NotFound() {
  const t = await getT();
  return (
    <section className="panel mx-auto my-10 grid w-full max-w-xl place-items-center gap-3 px-6 py-16 text-center">
      <p className="kicker">404</p>
      <SearchX aria-hidden className="size-8 text-gold" />
      <h1 className="font-display text-2xl">{t("system.notFound.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("system.notFound.body")}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button asChild>
          <Link href="/">{t("system.notFound.home")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/meta">{t("system.notFound.meta")}</Link>
        </Button>
      </div>
    </section>
  );
}
