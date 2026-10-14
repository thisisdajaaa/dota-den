import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/modules/identity";
import { groupsService } from "@/modules/groups";
import { MAX_GROUPS_PER_USER } from "@/modules/groups/domain/group";
import { CreateGroupForm } from "@/modules/groups/ui/create-group-form";
import { GroupsList } from "@/modules/groups/ui/groups-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("groups.page.title") };
}

export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const groups = await groupsService.listMine(user);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("groups.page.kicker")}
        title={t("groups.page.title")}
        description={t("groups.page.description")}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3" aria-label={t("groups.page.title")}>
          <GroupsList groups={groups} />
        </section>
        <div className="space-y-6 lg:col-span-2">
          <CreateGroupForm atCap={groups.length >= MAX_GROUPS_PER_USER} />
          <section className="panel flex items-start gap-3 p-5 text-sm" aria-labelledby="shares">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
            <div className="space-y-1">
              <h2 id="shares" className="font-semibold">
                {t("groups.shares.title")}
              </h2>
              <p className="text-muted-foreground">{t("groups.shares.body")}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
