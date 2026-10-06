import { Skeleton } from "@/components/ui/skeleton";
import { getT } from "@/common/i18n/server";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";

export default async function MetaLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("meta.page.loading")}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionSkeleton label={t("meta.page.loadingTopHeroes")} rows={6} />
        </div>
        <div className="lg:col-span-2">
          <SectionSkeleton label={t("meta.page.loadingDuos")} rows={4} />
        </div>
      </div>
    </div>
  );
}
