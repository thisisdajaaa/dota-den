import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/common/i18n/server";
import { matchesService } from "@/modules/matches";
import { HeroPicker } from "@/modules/guides/ui/hero-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("guides.title"), description: t("guides.description") };
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
