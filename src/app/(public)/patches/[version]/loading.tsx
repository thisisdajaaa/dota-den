import { Skeleton } from "@/components/ui/skeleton";

export default function PatchesLoading() {
  return (
    <div className="space-y-8" aria-busy aria-label="Loading patch notes">
      <Skeleton className="h-20 w-72" />
      <Skeleton className="h-56 rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
