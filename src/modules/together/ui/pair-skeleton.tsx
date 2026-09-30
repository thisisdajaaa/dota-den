import { Skeleton } from "@/components/ui/skeleton";

export function PairAnalysisSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Analysing your games together">
      <p className="text-sm text-muted-foreground" role="status">
        Checking your shared matches for party data…
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
