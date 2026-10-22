import type { Metadata } from "next";
import { Handshake, ShieldCheck } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { EmptyState } from "@/components/empty-state";
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
  const shares = (
    <section className="panel flex items-start gap-3 p-5 text-sm" aria-labelledby="shares">
      <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="space-y-1">
        <h2 id="shares" className="font-semibold">
          {t("groups.shares.title")}
        </h2>
        <p className="text-muted-foreground">{t("groups.shares.body")}</p>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("groups.page.kicker")}
        title={t("groups.page.title")}
        description={t("groups.page.description")}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        {groups.length === 0 ? (
          // No group yet: the create form is the page's one next step.
          <EmptyState
            icon={Handshake}
            title={t("groups.page.emptyTitle")}
            description={t("groups.page.empty")}
            className="lg:col-span-3"
          >
            <CreateGroupForm atCap={false} bare />
          </EmptyState>
        ) : (
          <section className="panel p-5 lg:col-span-3" aria-label={t("groups.page.title")}>
            <GroupsList groups={groups} />
          </section>
        )}
        <div className="space-y-6 lg:col-span-2">
          {groups.length > 0 && <CreateGroupForm atCap={groups.length >= MAX_GROUPS_PER_USER} />}
          {shares}
        </div>
      </div>
    </div>
  );
}
