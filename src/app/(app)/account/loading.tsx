import { getT } from "@/common/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function AccountLoading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy aria-label={t("privacy.loading")}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="panel space-y-3 p-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
