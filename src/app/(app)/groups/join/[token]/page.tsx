import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, ShieldCheck } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { plural } from "@/common/i18n/translate";
import { getCurrentUser } from "@/modules/identity";
import { groupsService } from "@/modules/groups";
import { MAX_GROUP_MEMBERS, MAX_GROUPS_PER_USER } from "@/modules/groups/domain/group";
import { InviteTokenParams } from "@/modules/groups/schemas/groups.schema";
import { JoinButton } from "@/modules/groups/ui/join-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // The token is in the URL: never send it on as a referrer, never index it.
  return {
    title: t("groups.join.kicker"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

export default async function JoinGroupPage({ params }: PageProps<"/groups/join/[token]">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const parsed = InviteTokenParams.safeParse(await params);
  const preview = parsed.success
    ? await groupsService.invitePreview(user, parsed.data.token)
    : null;

  if (!preview || !parsed.success) {
    return (
      <section className="panel mx-auto max-w-lg space-y-2 p-6 text-center">
        <h1 className="text-lg font-semibold">{t("groups.join.invalidTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("groups.join.invalidBody")}</p>
        <Link href="/groups" className="text-sm text-gold hover:underline">
          {t("groups.group.notFoundBack")}
        </Link>
      </section>
    );
  }

  return (
    <section className="panel mx-auto max-w-lg space-y-4 p-6" aria-labelledby="join-title">
      <div className="flex items-start gap-3">
        <Handshake aria-hidden className="mt-1 size-6 shrink-0 text-gold" />
        <div className="space-y-1">
          <p className="kicker">{t("groups.join.kicker")}</p>
          <h1 id="join-title" className="font-display text-2xl font-bold tracking-wide break-words">
            {t("groups.join.title", { name: preview.name })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {preview.ownerName && `${t("groups.join.by", { name: preview.ownerName })} · `}
            {t("groups.join.members", {
              members: plural(t, "groups.units.member", preview.memberCount),
            })}
          </p>
        </div>
      </div>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
        <span>{t("groups.shares.body")}</span>
      </p>
      {preview.alreadyMember ? (
        <p className="text-sm">
          {t("groups.join.already")}{" "}
          <Link href={`/groups/${preview.id}`} className="text-gold hover:underline">
            {t("groups.join.open")}
          </Link>
        </p>
      ) : preview.refusal === "group_full" ? (
        <p role="alert" className="text-sm text-loss">
          {t("groups.join.full", { max: MAX_GROUP_MEMBERS })}
        </p>
      ) : preview.refusal === "too_many_groups" ? (
        <p role="alert" className="text-sm text-loss">
          {t("groups.join.tooMany", { max: MAX_GROUPS_PER_USER })}
        </p>
      ) : (
        <JoinButton token={parsed.data.token} />
      )}
    </section>
  );
}
