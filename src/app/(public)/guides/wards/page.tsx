import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/common/i18n/server";
import { guideService } from "@/modules/guides";
import { isWardKind, isWardPhase, isWardSide } from "@/modules/guides/domain/ward-spots";
import { WardMap } from "@/modules/guides/ui/build-sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("guides.wards.page.title"),
    description: t("guides.wards.page.description"),
    alternates: { canonical: "/guides/wards" },
  };
}

export default async function WardSpotsPage({ searchParams }: PageProps<"/guides/wards">) {
  const { ws, wp, wk } = await searchParams;
  const t = await getT();
  const data = await guideService.wardCells();
  return (
    <div className="space-y-6">
      <Link
        href="/guides"
        className="relative inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground touch:tap-area"
      >
        <ArrowLeft aria-hidden className="size-4" /> {t("guides.hero.back")}
      </Link>
      <PageHeader
        kicker={t("guides.wards.page.kicker")}
        title={t("guides.wards.page.title")}
        description={t("guides.wards.page.description")}
      />
      <WardMap
        data={data}
        side={isWardSide(ws) ? ws : "radiant"}
        phase={isWardPhase(wp) ? wp : "early"}
        kind={isWardKind(wk) ? wk : "observer"}
        hrefFor={(v) => `/guides/wards?ws=${v.side}&wp=${v.phase}&wk=${v.kind}`}
      />
    </div>
  );
}
