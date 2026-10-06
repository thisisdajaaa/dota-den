import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function LeaderboardsLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("leaderboards.page.loading")}>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-9 w-80 rounded-lg" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
