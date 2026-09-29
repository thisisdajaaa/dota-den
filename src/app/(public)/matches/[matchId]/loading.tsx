import { Skeleton } from "@/components/ui/skeleton";

export default function MatchLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading match">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
