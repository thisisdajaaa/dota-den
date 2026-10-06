import { getT } from "@/common/i18n/server";
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
export async function DashboardFilters({
  filter,
  latestPatch,
}: {
  filter: DashboardFilter;
  latestPatch: string | null;
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
        href={(range) => href({ ...filter, range })}
      />
      <SegmentedLinks
        label={t("matches.filters.gameType")}
        options={[
          { value: "all", label: t("matches.filters.allGames") },
          { value: "ranked", label: t("matches.filters.rankedOnly") },
        ]}
        active={filter.mode}
        href={(mode) => href({ ...filter, mode })}
      />
    </div>
  );
}
