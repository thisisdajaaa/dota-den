import { SegmentedLinks } from "@/components/segmented-links";
import type { DashboardFilter } from "../matches.ports";

function href(filter: DashboardFilter): string {
  const params = new URLSearchParams();
  if (filter.range !== "all") params.set("range", filter.range);
  if (filter.mode !== "all") params.set("mode", filter.mode);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

/** One filter row scoping everything below it. */
export function DashboardFilters({
  filter,
  latestPatch,
}: {
  filter: DashboardFilter;
  latestPatch: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedLinks
        label="Time range"
        options={[
          { value: "all", label: "All imported" },
          { value: "patch", label: latestPatch ? `Patch ${latestPatch}` : "Current patch" },
          { value: "30d", label: "Last 30 days" },
        ]}
        active={filter.range}
        href={(range) => href({ ...filter, range })}
      />
      <SegmentedLinks
        label="Game type"
        options={[
          { value: "all", label: "All games" },
          { value: "ranked", label: "Ranked only" },
        ]}
        active={filter.mode}
        href={(mode) => href({ ...filter, mode })}
      />
    </div>
  );
}
