import Link from "next/link";
import { Handshake } from "lucide-react";
import { getT } from "@/common/i18n/server";
import type { GroupSummaryDto } from "../dtos/responses/groups.dto";
import { GroupsList } from "./groups-list";

/** On the Together page: your groups, or a nudge to create one. */
export async function TogetherGroupsCard({ groups }: { groups: GroupSummaryDto[] }) {
  const t = await getT();
  return (
    <section className="panel space-y-2 p-5" aria-labelledby="your-groups">
      <div className="flex items-start gap-3">
        <Handshake aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <h2 id="your-groups" className="font-semibold">
            {t("groups.together.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("groups.together.description")}</p>
        </div>
      </div>
      {groups.length > 0 ? (
        <GroupsList groups={groups} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("groups.together.none")}</p>
      )}
      <Link href="/groups" className="inline-block text-sm text-gold hover:underline">
        {groups.length > 0 ? t("groups.together.all") : t("groups.together.create")}
      </Link>
    </section>
  );
}
