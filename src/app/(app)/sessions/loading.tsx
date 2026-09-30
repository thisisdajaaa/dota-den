import { Skeleton } from "@/components/ui/skeleton";

export default function SessionsLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading sessions">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-[28rem] rounded-2xl" />
    </div>
  );
}
