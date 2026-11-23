import Link from "next/link";
import { ChartColumn, LayoutGrid, Target, Users, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { getT } from "@/common/i18n/server";
import type { DashboardFilter } from "@/modules/matches/domain/read-models";

export const DASHBOARD_VIEWS = ["overview", "stats", "friends", "progress"] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

const ICONS: Record<DashboardView, LucideIcon> = {
  overview: LayoutGrid,
  stats: ChartColumn,
  friends: Users,
  progress: Target,
};

export function parseView(value: unknown): DashboardView {
  const v = Array.isArray(value) ? value[0] : value;
  return DASHBOARD_VIEWS.includes(v as DashboardView) ? (v as DashboardView) : "overview";
}

/** The dashboard's URL for a tab, keeping the match filters (they scope Overview and Stats). */
export function dashboardHref(view: DashboardView, filter: DashboardFilter): string {
  const params = new URLSearchParams();
  if (view !== "overview") params.set("view", view);
  if (filter.range !== "all") params.set("range", filter.range);
  if (filter.mode !== "all") params.set("mode", filter.mode);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

/**
 * The dashboard in four tabs instead of one long scroll: links (shareable, no client state),
 * and only the open tab's panels are loaded.
 */
export async function DashboardTabs({
  active,
  filter,
}: {
  active: DashboardView;
  filter: DashboardFilter;
}) {
  const t = await getT();
  return (
    <nav
      aria-label={t("dashboard.tabs.label")}
      className="-mx-4 overflow-x-auto border-b border-white/[0.07] px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {DASHBOARD_VIEWS.map((view) => {
          const Icon = ICONS[view];
          const current = view === active;
          return (
            <li key={view}>
              <Link
                href={dashboardHref(view, filter)}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative -mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                  current
                    ? "border-gold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className={cn("size-4", current && "text-gold")} />
                {t(`dashboard.tabs.${view}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
