import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { env } from "@/common/config/env";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity";
import { referralService } from "@/modules/plus";
import { InviteLinkCard } from "@/modules/plus/ui/invite-link-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("plus.invite.title") };
}

const RULES = ["link", "games", "free", "paid", "max", "once"] as const;

/** Invite a friend: your link, how your friends are doing, and the rules (ADR 0013). */
export default async function InvitePage() {
  const t = await getT();
  // The (app) layout already sent signed-out visitors to sign in.
  const user = (await getCurrentUser())!;
  const invite = await referralService.invite(user);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("plus.page.title")}
        title={t("plus.invite.title")}
        description={t("plus.invite.lead")}
      />

      {!invite.available || !invite.code ? (
        <p className="panel p-5 text-sm text-muted-foreground" role="status">
          {t("plus.invite.unavailable")}
        </p>
      ) : (
        <>
          <InviteLinkCard url={new URL(`/r/${invite.code}`, env().APP_URL).toString()} />
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label={t("plus.invite.joined")} value={String(invite.joined)} />
            <StatTile label={t("plus.invite.waiting")} value={String(invite.waiting)} />
            <StatTile
              label={t("plus.invite.earned")}
              value={t("plus.invite.earnedOf", { earned: invite.earned, max: invite.max })}
              tone={invite.earned > 0 ? "gold" : "muted"}
            />
          </dl>
          {invite.earned >= invite.max && (
            <p className="text-sm text-muted-foreground" role="status">
              {t("plus.invite.maxed", { max: invite.max })}
            </p>
          )}
        </>
      )}

      {invite.mine && (
        <p className="panel flex items-start gap-2 p-4 text-sm" role="status">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
          {t(`plus.invite.mine.${invite.mine}`)}
        </p>
      )}

      <section className="panel space-y-3 p-5" aria-labelledby="invite-rules">
        <h2 id="invite-rules" className="text-lg font-semibold">
          {t("plus.invite.rulesTitle")}
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground marker:text-gold">
          {RULES.map((r) => (
            <li key={r}>{t(`plus.invite.rules.${r}`, { max: invite.max })}</li>
          ))}
        </ol>
        <Button asChild variant="outline" size="sm">
          <Link href="/plus">{t("plus.referral.seePlus")}</Link>
        </Button>
      </section>
    </div>
  );
}
