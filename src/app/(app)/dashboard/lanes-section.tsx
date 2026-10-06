import Link from "next/link";
import { getT } from "@/common/i18n/server";
import { logger } from "@/common/logging/logger";
import { heroesService } from "@/modules/heroes";
import { LaneBreakdownCard } from "@/modules/heroes/ui/lane-breakdown-card";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";

export async function LanesSkeleton() {
  const t = await getT();
  return <SectionSkeleton label={t("dashboard.lanes.loading")} rows={5} />;
}

/**
 * The overview's lane and role card. Streams behind Suspense; a failure blanks only this card.
 */
export async function LanesSection({ accountId32 }: { accountId32: number }) {
  let res: Awaited<ReturnType<(typeof heroesService)["laneBreakdown"]>>;
  try {
    res = await heroesService.laneBreakdown(accountId32);
  } catch (e) {
    logger.error("lanes_section_failed", { error: e });
    res = { ok: false, error: { type: "unavailable", cause: "error" } };
  }
  const t = await getT();
  if (!res.ok) {
    logger.warn("lanes_section_unavailable", { reason: res.error.type });
    return (
      <MetaSection
        id="lane-breakdown"
        kicker={t("dashboard.lanes.kicker")}
        title={t("dashboard.lanes.title")}
      >
        <Unavailable>
          {res.error.type === "rate_limited"
            ? t("dashboard.lanes.rateLimited")
            : t("dashboard.lanes.unavailable")}
        </Unavailable>
      </MetaSection>
    );
  }
  return (
    <div className="space-y-2">
      <LaneBreakdownCard view={res.value} />
      <p className="text-right text-xs">
        <Link href="/heroes" className="text-gold hover:underline">
          {t("dashboard.lanes.positions")}
        </Link>
      </p>
    </div>
  );
}
