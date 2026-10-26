import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { SegmentedLinks } from "@/components/segmented-links";
import { compareService } from "@/modules/heroes";
import { CompareSections } from "@/modules/heroes/ui/compare-view";
import { getCurrentUser } from "@/modules/identity";
import { matchesService } from "@/modules/matches";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("heroes.compare.metaTitle") };
}

/** How you compare: your heroes against players at your rank (or the one above). */
export default async function ComparePage({ searchParams }: PageProps<"/heroes/compare">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { vs } = await searchParams;
  const target = vs === "next" ? "next" : "mine";
  const [t, view, heroes] = await Promise.all([
    getT(),
    compareService.compare(user, target),
    matchesService.heroMap(),
  ]);
  return (
    <div className="space-y-6">
      <Link
        href="/heroes"
        className="relative inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
      >
        <ArrowLeft aria-hidden className="size-4" /> {t("heroes.compare.back")}
      </Link>
      <PageHeader
        kicker={t("heroes.compare.kicker")}
        title={t("heroes.compare.title")}
        description={t("heroes.compare.description")}
      />
      {view.yourBracket && (
        <SegmentedLinks
          label={t("heroes.compare.against")}
          options={[
            { value: "mine", label: t("heroes.compare.yourRank") },
            { value: "next", label: t("heroes.compare.rankAbove") },
          ]}
          active={target}
          href={(v) => (v === "next" ? "/heroes/compare?vs=next" : "/heroes/compare")}
        />
      )}
      <CompareSections view={view} heroes={heroes} />
    </div>
  );
}
