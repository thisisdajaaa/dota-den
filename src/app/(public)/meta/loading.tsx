import { Skeleton } from "@/components/ui/skeleton";
import { SectionSkeleton } from "@/modules/meta/ui/meta-section";

export default function MetaLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading meta">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionSkeleton label="Loading top heroes" rows={6} />
        </div>
        <div className="lg:col-span-2">
          <SectionSkeleton label="Loading lane duos" rows={4} />
        </div>
      </div>
    </div>
  );
}
