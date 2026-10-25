import type { Metadata } from "next";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { matchesService } from "@/modules/matches";
import { PickForMe } from "@/modules/drafts/ui/pick-for-me";
import type { DraftHero } from "@/modules/drafts/ui/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("drafts.pick.metaTitle") };
}

/** "Pick for me" during a real ranked draft (signed in: it ranks your own heroes). */
export default async function PickForMePage() {
  const t = await getT();
  const heroes: DraftHero[] = [...(await matchesService.heroMap()).values()]
    .map((h) => ({
      id: h.id,
      name: h.name,
      imageUrl: h.imageUrl,
      iconUrl: h.iconUrl,
      primaryAttr: h.primaryAttr,
      roles: h.roles,
      attackType: h.attackType,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("drafts.pick.kicker")}
        title={t("drafts.pick.title")}
        description={t("drafts.pick.description")}
      />
      <PickForMe heroes={heroes} />
    </div>
  );
}
