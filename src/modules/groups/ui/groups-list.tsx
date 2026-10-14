import Link from "next/link";
import { Crown } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import type { GroupSummaryDto } from "../dtos/responses/groups.dto";

/** The groups you're in, each linking to its page. */
export async function GroupsList({ groups }: { groups: GroupSummaryDto[] }) {
  const t = await getT();
  if (groups.length === 0)
    return <p className="text-sm text-muted-foreground">{t("groups.page.empty")}</p>;
  return (
    <ul className="divide-y divide-white/[0.04]">
      {groups.map((g) => (
        <li key={g.id}>
          <Link
            href={`/groups/${g.id}`}
            className="flex items-center justify-between gap-3 py-3 hover:text-gold"
            aria-label={t("groups.page.open", { name: g.name })}
          >
            <span className="min-w-0 truncate font-medium">{g.name}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {g.isOwner && (
                <span className="inline-flex items-center gap-1 text-gold">
                  <Crown aria-hidden className="size-3" />
                  {t("groups.page.owner")}
                </span>
              )}
              {plural(t, "groups.units.member", g.memberCount)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
