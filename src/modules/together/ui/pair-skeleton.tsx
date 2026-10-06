import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export async function PairAnalysisSkeleton() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("together.skeleton.label")}>
      <p className="text-sm text-muted-foreground" role="status">
        {t("together.skeleton.status")}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
