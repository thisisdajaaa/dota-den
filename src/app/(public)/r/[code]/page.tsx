import type { Metadata } from "next";
import Link from "next/link";
import { Gift } from "lucide-react";
import { getT } from "@/common/i18n/server";
import { SteamIcon } from "@/components/icons/steam-icon";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity";
import { signInHref } from "@/modules/identity/domain/return-path";
import { referralService } from "@/modules/plus";
import { normalizeReferralCode } from "@/modules/plus/domain/referral";
import { ClaimInvite } from "@/modules/plus/ui/claim-invite";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // Personal links: shown when shared, never indexed.
  return {
    title: t("plus.referral.title"),
    description: t("plus.referral.metaDescription"),
    robots: { index: false, follow: false },
  };
}

/**
 * A friend's invite link. Signed out: what Dota Den is and a Steam sign-in that comes back
 * here. Signed in: claim it. The inviter's name isn't shown (their profile may be private).
 */
export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const t = await getT();
  const { code: raw } = await params;
  const code = normalizeReferralCode(raw);
  const [user, owner] = await Promise.all([
    getCurrentUser({ tolerateErrors: true }),
    code ? referralService.codeOwner(code) : Promise.resolve(null),
  ]);
  const available = referralService.available;

  let body: React.ReactNode;
  if (!available)
    body = <p className="text-sm text-muted-foreground">{t("plus.referral.unavailable")}</p>;
  else if (!code || !owner)
    body = (
      <div className="space-y-1">
        <h2 className="font-semibold">{t("plus.referral.notFoundTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("plus.referral.notFoundBody")}</p>
      </div>
    );
  else if (!user)
    body = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("plus.referral.fine")}</p>
        <Button asChild className="gap-2">
          {/* Full navigation: Steam's sign-in, then back here to claim. */}
          <a href={signInHref(`/r/${code}`)}>
            <SteamIcon aria-hidden className="size-4" /> {t("plus.referral.signIn")}
          </a>
        </Button>
      </div>
    );
  else if (owner === user.id)
    body = <p className="text-sm text-muted-foreground">{t("plus.referral.own")}</p>;
  else body = <ClaimInvite code={code} />;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <section className="panel space-y-5 border-gold/30 p-6" aria-labelledby="referral-title">
        <div className="flex items-start gap-3">
          <Gift aria-hidden className="mt-1 size-6 shrink-0 text-gold" />
          <div className="space-y-2">
            <h1
              id="referral-title"
              className="font-display text-2xl font-bold tracking-wide sm:text-3xl"
            >
              {t("plus.referral.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("plus.referral.lead")}</p>
          </div>
        </div>
        {body}
      </section>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link href="/plus" className="text-gold hover:underline">
          {t("plus.referral.seePlus")}
        </Link>
        {user && (
          <Link href="/invite" className="text-gold hover:underline">
            {t("plus.referral.getYours")}
          </Link>
        )}
      </p>
    </div>
  );
}
