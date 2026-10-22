import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function GuidesLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("guides.index.loading")}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {Array.from({ length: 16 }, (_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
