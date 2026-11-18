import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Eye } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/common/i18n/server";
import { matchesService } from "@/modules/matches";
import { HeroPicker } from "@/modules/guides/ui/hero-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("guides.title"),
    description: t("guides.description"),
    alternates: { canonical: "/guides" },
  };
}

const ATTRS = ["str", "agi", "int", "all"] as const;

export default async function GuidesPage() {
  const t = await getT();
  const heroes = [...(await matchesService.heroMap()).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const groups = [
    ...ATTRS.map((key) => ({
      label: t(`guides.index.attrs.${key}`),
      heroes: heroes.filter((h) => h.primaryAttr === key),
    })),
    {
      label: t("guides.index.attrs.other"),
      heroes: heroes.filter((h) => !ATTRS.some((key) => key === h.primaryAttr)),
    },
  ].filter((g) => g.heroes.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("guides.index.kicker")}
        title={t("guides.index.title")}
        description={t("guides.index.description")}
      />
      <Link
        href="/guides/wards"
        className="panel flex items-center gap-3 p-4 transition-colors hover:border-gold/40"
      >
        <Eye aria-hidden className="size-5 shrink-0 text-gold" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t("guides.wards.link")}</span>
          <span className="block text-sm text-muted-foreground">{t("guides.wards.linkHint")}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
      {heroes.length === 0 ? (
        <p className="panel p-5 text-sm text-muted-foreground">
          {t("guides.index.heroesUnavailable")}
        </p>
      ) : (
        <HeroPicker groups={groups} />
      )}
    </div>
  );
}
