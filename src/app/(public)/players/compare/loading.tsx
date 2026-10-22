import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function CompareLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("players.compare.loading")}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
