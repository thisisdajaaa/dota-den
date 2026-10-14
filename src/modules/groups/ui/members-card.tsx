import Link from "next/link";
import { Crown } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { displayName, PlayerAvatar } from "@/modules/players/ui/player-avatar";
import type { GroupMemberDto } from "../dtos/responses/groups.dto";
import { RemoveMemberButton } from "./remove-member-button";

/** Members with their Steam name and avatar; the owner can remove anyone else. */
export async function MembersCard({
  groupId,
  members,
  canRemove,
}: {
  groupId: string;
  members: GroupMemberDto[];
  canRemove: boolean;
}) {
  const t = await getT();
  return (
    <section className="panel overflow-hidden" aria-labelledby="members-title">
      <div className="p-5 pb-3">
        <h2 id="members-title" className="text-lg font-semibold">
          {t("groups.group.membersTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {plural(t, "groups.units.member", members.length)}
        </p>
      </div>
      <ul className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
        {members.map((m) => {
          const name = displayName(m.name, m.accountId32);
          return (
            <li key={m.accountId32} className="flex items-center gap-3 px-5 py-3">
              <PlayerAvatar url={m.avatarUrl} name={name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {name}
                  {m.you && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({t("groups.group.you")})
                    </span>
                  )}
                  {m.isOwner && (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-gold">
                      <Crown aria-hidden className="size-3" />
                      {t("groups.group.owner")}
                    </span>
                  )}
                </p>
                {!m.you && (
                  <Link
                    href={`/together/${m.accountId32}`}
                    className="text-xs text-muted-foreground hover:text-gold"
                    aria-label={t("groups.group.togetherWith", { name })}
                  >
                    {t("groups.group.together")}
                  </Link>
                )}
              </div>
              {canRemove && !m.you && (
                <RemoveMemberButton groupId={groupId} accountId32={m.accountId32} name={name} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
