import { Skeleton } from "@/components/ui/skeleton";

export default function PlayersLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading players">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-32 rounded-2xl" />
      <div className="panel space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
