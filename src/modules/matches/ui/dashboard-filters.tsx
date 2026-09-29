import Link from "next/link";
import { cn } from "cn";
import type { DashboardFilter } from "../application/ports";

const RANGES: Array<{ value: DashboardFilter["range"]; label: string }> = [
  { value: "all", label: "All imported" },
  { value: "patch", label: "Current patch" },
  { value: "30d", label: "Last 30 days" },
];
const MODES: Array<{ value: DashboardFilter["mode"]; label: string }> = [
  { value: "all", label: "All games" },
  { value: "ranked", label: "Ranked only" },
];

function href(filter: DashboardFilter): string {
  const params = new URLSearchParams();
  if (filter.range !== "all") params.set("range", filter.range);
  if (filter.mode !== "all") params.set("mode", filter.mode);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

function Segmented<T extends string>({
  label,
  options,
  active,
  make,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  active: T;
  make: (value: T) => string;
}) {
  return (
    <nav
      aria-label={label}
      className="inline-flex rounded-lg border border-white/[0.07] bg-card/60 p-0.5"
    >
      {options.map((o) => {
        const isActive = o.value === active;
        return (
          <Link
            key={o.value}
            href={make(o.value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
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

/** One filter row scoping everything below it. */
export function DashboardFilters({
  filter,
  latestPatch,
}: {
  filter: DashboardFilter;
  latestPatch: string | null;
}) {
  const ranges = RANGES.map((r) =>
    r.value === "patch" && latestPatch ? { ...r, label: `Patch ${latestPatch}` } : r,
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Time range"
        options={ranges}
        active={filter.range}
        make={(range) => href({ ...filter, range })}
      />
      <Segmented
        label="Game type"
        options={MODES}
        active={filter.mode}
        make={(mode) => href({ ...filter, mode })}
      />
    </div>
  );
}
