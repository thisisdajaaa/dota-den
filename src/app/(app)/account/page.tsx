import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { discordLinkService, discordWebhookService } from "@/modules/discord";
import { DiscordLinkCard } from "@/modules/discord/ui/discord-link-card";
import { DiscordCard } from "@/modules/discord/ui/discord-card";
import { emailService } from "@/modules/email";
import { EmailDigestCard } from "@/modules/email/ui/email-digest-card";
import { getCurrentUser } from "@/modules/identity";
import { notificationService, vapidPublicKey } from "@/modules/notifications";
import { NotificationsCard } from "@/modules/notifications/ui/notifications-card";
import { plusService } from "@/modules/plus";
import { PlanCard } from "@/modules/plus/ui/plan-card";
import { isJourneyRange } from "@/modules/mmr/domain/journey";
import { sharesService } from "@/modules/shares";
import { SharedLinks } from "@/modules/shares/ui/shared-links";
import { DeleteAccountForm } from "@/modules/privacy/ui/delete-account-form";
import { getT } from "@/common/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("privacy.title") };
}

const DISCORD_OUTCOMES = ["linked", "denied", "bad_state", "off"] as const;

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { discord: discordParam } = await searchParams;
  const discordOutcome = DISCORD_OUTCOMES.find((o) => o === discordParam) ?? null;
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const offer = plusService.offer();
  const [notifications, shares, discord, discordLink, email, plan] = await Promise.all([
    notificationService.status(user.id),
    sharesService.list(user.id),
    discordWebhookService.status(user.id),
    discordLinkService.status(user.id).catch(() => ({ enabled: false, linked: null })),
    emailService.status(user.id),
    plusService.plan(user.id),
  ]);
  // The plan card exists once Plus is configured, for anyone with a subscription on record,
  // and for anyone with Plus (staff).
  const showPlan = offer.status !== "off" || plan.status !== null || plan.plus;
  const shareLinks = shares.map((s) => ({
    slug: s._id,
    url: `/s/${s._id}`,
    label:
      s.kind === "session"
        ? t("shares.account.sessionLabel", {
            date:
              s.snapshot.kind === "session"
                ? s.snapshot.startedAt.toISOString().slice(0, 10)
                : s.ref,
          })
        : s.kind === "journey"
          ? t("shares.account.journeyLabel", {
              range: isJourneyRange(s.ref) ? t(`mmr.journey.ranges.${s.ref}`) : s.ref,
            })
          : t("shares.account.weekLabel", { date: s.ref }),
  }));
  const downloads = [
    {
      format: "json",
      label: t("privacy.download.json.label"),
      hint: t("privacy.download.json.hint"),
    },
    {
      format: "matches-csv",
      label: t("privacy.download.matches.label"),
      hint: t("privacy.download.matches.hint"),
    },
    {
      format: "mmr-csv",
      label: t("privacy.download.mmr.label"),
      hint: t("privacy.download.mmr.hint"),
    },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("privacy.kicker")}
        title={t("privacy.title")}
        description={t("privacy.description")}
      />

      {showPlan && <PlanCard plan={plan} offer={offer} />}

      <NotificationsCard
        publicKey={vapidPublicKey()}
        endpoints={notifications.endpoints}
        prefs={notifications.prefs}
        plus={plan.plus}
      />

      <EmailDigestCard initial={email} />

      <DiscordLinkCard initial={discordLink} outcome={discordOutcome} />

      <DiscordCard initial={discord} />

      <SharedLinks links={shareLinks} />

      <section className="panel space-y-4 p-5" aria-labelledby="download-title">
        <h2 id="download-title" className="text-lg font-semibold">
          {t("privacy.download.title")}
        </h2>
        <ul className="space-y-3">
          {downloads.map((d) => (
            <li key={d.format} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">{d.hint}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={`/api/v1/me/export?format=${d.format}`} download>
                  <Download aria-hidden className="size-4" /> {t("privacy.download.button")}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel space-y-4 border-loss/30 p-5" aria-labelledby="delete-title">
        <div>
          <h2 id="delete-title" className="text-lg font-semibold text-loss">
            {t("privacy.delete.title")}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("privacy.delete.removes")}</li>
            <li>{t("privacy.delete.friends")}</li>
            <li>{t("privacy.delete.backups")}</li>
            <li>{t("privacy.delete.opendota")}</li>
            {showPlan && <li>{t("plus.deleteNote")}</li>}
          </ul>
          {plan.stillBills && (
            <p
              role="alert"
              data-testid="plus-delete-warning"
              className="mt-3 rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm text-foreground"
            >
              {t("plus.deleteWarning")}{" "}
              <a href="/api/v1/me/plus/portal" className="font-medium text-gold hover:underline">
                {t("plus.card.manage")}
              </a>
            </p>
          )}
        </div>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
