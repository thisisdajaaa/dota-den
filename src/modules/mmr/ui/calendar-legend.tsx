import { getT } from "@/common/i18n/server";

export async function CalendarLegend() {
  const t = await getT();
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-win/60" aria-hidden /> {t("mmr.legend.gained")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-loss/60" aria-hidden /> {t("mmr.legend.lost")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-foreground/60" aria-hidden />
        <span>
          <span className="font-medium text-foreground">+50</span> {t("mmr.legend.exact")}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-dashed border-foreground/40" aria-hidden />
        <span>
          <span className="font-medium text-foreground">≈ +25</span> {t("mmr.legend.estimate")}
        </span>
      </span>
    </div>
  );
}
