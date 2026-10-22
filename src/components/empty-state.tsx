import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/**
 * The standard "nothing here yet" panel: an icon, a title, a short explanation and the one
 * thing to do next. `action` is the primary next step as a link; `children` holds anything
 * richer (a form, secondary links) under the explanation. Works in server and client
 * components.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  live = false,
  compact = false,
  className,
  "aria-label": ariaLabel,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: { href: string; label: string };
  children?: React.ReactNode;
  /** Announce changes (e.g. a status that updates while the page is open). */
  live?: boolean;
  /** Less padding, for a panel that shares the page with other content. */
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      className={cn(
        "panel grid place-items-center gap-3 px-6 text-center",
        compact ? "py-10" : "py-16",
        className,
      )}
      aria-live={live ? "polite" : undefined}
      aria-label={ariaLabel}
    >
      <span className="grid size-14 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
        <Icon aria-hidden className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Button asChild size="lg" className="mt-1 px-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
      {children}
    </section>
  );
}
