import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Card shell shared by the Meta sections: kicker, title, optional note and footer. */
export function MetaSection({
  id,
  kicker,
  title,
  description,
  footer,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby={id}>
      <div className="space-y-1 p-5 pb-3">
        <p className="kicker">{kicker}</p>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
      {footer && (
        <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-muted-foreground">
          {footer}
        </p>
      )}
    </section>
  );
}

/** Shown in place of a section's data when its source failed. */
export function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 border-t border-white/[0.06] px-5 py-6 text-sm text-muted-foreground"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
      <span>{children}</span>
    </p>
  );
}

export function SectionSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div className="panel space-y-3 p-5" aria-busy aria-label={label}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-[4.44rem] rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
