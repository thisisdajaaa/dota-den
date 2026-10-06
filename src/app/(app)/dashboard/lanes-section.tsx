import Link from "next/link";
import { logger } from "@/common/logging/logger";
import { heroesService } from "@/modules/heroes";
import { LaneBreakdownCard } from "@/modules/heroes/ui/lane-breakdown-card";
import { unavailableCopy } from "@/modules/heroes/ui/hero-sections";
import { MetaSection, SectionSkeleton, Unavailable } from "@/modules/meta/ui/meta-section";

export function LanesSkeleton() {
  return <SectionSkeleton label="Loading where you play" rows={5} />;
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
  if (!res.ok) {
    logger.warn("lanes_section_unavailable", { reason: res.error.type });
    return (
      <MetaSection id="lane-breakdown" kicker="Lanes and roles" title="Where you play">
        <Unavailable>{unavailableCopy(res.error, "lane data")}</Unavailable>
      </MetaSection>
    );
  }
  return (
    <div className="space-y-2">
      <LaneBreakdownCard view={res.value} />
      <p className="text-right text-xs">
        <Link href="/heroes" className="text-gold hover:underline">
          Heroes in each position
        </Link>
      </p>
    </div>
  );
}
