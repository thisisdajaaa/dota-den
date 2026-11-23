import { getT } from "@/common/i18n/server";
import { SegmentedLinks } from "@/components/segmented-links";
import type { DashboardFilter } from "../matches.ports";

function href(filter: DashboardFilter, view?: string): string {
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (filter.range !== "all") params.set("range", filter.range);
  if (filter.mode !== "all") params.set("mode", filter.mode);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

/** One filter row scoping everything below it. */
export async function DashboardFilters({
  filter,
  latestPatch,
  view,
}: {
  filter: DashboardFilter;
  latestPatch: string | null;
  /** The dashboard tab the filters live on (kept in their links); omitted for Overview. */
  view?: string;
}) {
  const t = await getT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedLinks
        label={t("matches.filters.timeRange")}
        options={[
          { value: "all", label: t("matches.filters.allImported") },
          {
            value: "patch",
            label: latestPatch
              ? t("matches.filters.patch", { version: latestPatch })
              : t("matches.filters.currentPatch"),
          },
          { value: "30d", label: t("matches.filters.last30") },
        ]}
        active={filter.range}
        href={(range) => href({ ...filter, range }, view)}
      />
      <SegmentedLinks
        label={t("matches.filters.gameType")}
        options={[
          { value: "all", label: t("matches.filters.allGames") },
          { value: "ranked", label: t("matches.filters.rankedOnly") },
        ]}
        active={filter.mode}
        href={(mode) => href({ ...filter, mode }, view)}
      />
    </div>
  );
}
