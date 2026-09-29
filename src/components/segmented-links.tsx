import Link from "next/link";
import { cn } from "cn";

/** URL-driven segmented control: each option is a link, so filters are shareable. */
export function SegmentedLinks<T extends string>({
  label,
  options,
  active,
  href,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  active: T;
  href: (value: T) => string;
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-lg border border-white/[0.07] bg-card/60 p-0.5"
    >
      {options.map((o) => {
        const isActive = o.value === active;
        return (
          <Link
            key={o.value}
            href={href(o.value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-gold/15 text-gold shadow-[inset_0_0_0_1px_oklch(0.8_0.13_80/0.3)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
