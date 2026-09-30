import { Skeleton } from "@/components/ui/skeleton";

export default function HeroLoading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading hero">
      <Skeleton className="h-4 w-24" />
      <div className="panel flex items-center gap-5 p-6">
        <Skeleton className="h-14 w-[6.22rem] rounded-md" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}
