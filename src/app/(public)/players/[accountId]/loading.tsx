import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function PlayerLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("players.profile.loading")}>
      <Skeleton className="h-4 w-24" />
      <div className="panel flex items-center gap-5 p-6">
        <Skeleton className="size-20 rounded-xl sm:size-24" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
