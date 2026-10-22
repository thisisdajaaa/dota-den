import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function RankJourneyLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("mmr.journey.loading")}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="panel space-y-4 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
