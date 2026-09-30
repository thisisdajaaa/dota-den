import { Skeleton } from "@/components/ui/skeleton";

export default function TogetherLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading your friends">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="h-96 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
