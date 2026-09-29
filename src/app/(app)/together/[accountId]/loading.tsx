import { Skeleton } from "@/components/ui/skeleton";
import { PairAnalysisSkeleton } from "@/modules/together/ui/pair-skeleton";

export default function TogetherPairLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="panel flex items-center gap-4 p-6">
        <Skeleton className="size-14 rounded-lg" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-56" />
        </div>
      </div>
      <PairAnalysisSkeleton />
    </div>
  );
}
