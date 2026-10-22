import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder while the stream list loads. */
export function HubSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-6" aria-busy aria-label={label}>
      <div className="panel space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="overflow-hidden rounded-xl border border-white/[0.07] bg-card/60"
            >
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="flex gap-3 p-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
