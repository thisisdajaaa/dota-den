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
import { sessionService } from "@/modules/sessions";
import { StopLossCard } from "@/modules/sessions/ui/stop-loss-card";
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
  const [notifications, shares, discord, discordLink, email, plan, stopLoss] = await Promise.all([
    notificationService.status(user.id),
    sharesService.list(user.id),
    discordWebhookService.status(user.id),
    discordLinkService
      .status(user.id)
      .catch(() => ({ enabled: false, linked: null, inviteUrl: null, canNudge: false })),
    emailService.status(user.id),
    plusService.plan(user.id),
    sessionService.stopLossSettings({ userId: user.id, accountId32: user.accountId32 }),
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
          : s.kind === "streak"
            ? t("shares.account.streakLabel", { n: s.snapshot.games })
            : s.kind === "match"
              ? t("shares.account.matchLabel", { id: s.ref })
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
  // A long settings page: a section index, as chips under the phone header and as a sticky
  // list beside the cards on wide screens.
  const sections = [
    ...(showPlan ? [{ id: "plan", label: t("privacy.nav.plan") }] : []),
    { id: "stop-loss", label: t("privacy.nav.stopLoss") },
    { id: "notifications", label: t("privacy.nav.notifications") },
    { id: "email", label: t("privacy.nav.email") },
    { id: "discord-settings", label: t("privacy.nav.discord") },
    { id: "shares", label: t("privacy.nav.shares") },
    { id: "your-data", label: t("privacy.nav.data") },
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("privacy.kicker")}
        title={t("privacy.title")}
        description={t("privacy.description")}
      />

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <nav
          aria-label={t("privacy.nav.label")}
          className="sticky top-14 z-20 -mx-4 mb-6 overflow-x-auto border-b border-white/[0.06] bg-background/85 px-4 py-2 backdrop-blur-xl lg:top-6 lg:mx-0 lg:mb-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          <ul className="flex min-w-max gap-1.5 lg:min-w-0 lg:flex-col lg:gap-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex min-h-9 items-center rounded-full border border-white/[0.08] px-3 text-xs font-medium whitespace-nowrap text-muted-foreground hover:text-foreground lg:rounded-md lg:border-0 lg:px-2.5 lg:text-sm"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6 [&>*]:scroll-mt-32 lg:[&>*]:scroll-mt-6">
          {showPlan && <PlanCard plan={plan} offer={offer} />}

          <StopLossCard initial={stopLoss} />

          <NotificationsCard
            publicKey={vapidPublicKey()}
            endpoints={notifications.endpoints}
            prefs={notifications.prefs}
            plus={plan.plus}
          />

          <EmailDigestCard initial={email} />

          {/* Both Discord cards under one index entry (the link card may be hidden). */}
          <div id="discord-settings" className="space-y-6">
            <DiscordLinkCard initial={discordLink} outcome={discordOutcome} />
            <DiscordCard initial={discord} />
          </div>

          <div id="shares">
            <SharedLinks links={shareLinks} />
          </div>

          <section id="your-data" className="panel space-y-4 p-5" aria-labelledby="download-title">
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
                  <a
                    href="/api/v1/me/plus/portal"
                    className="font-medium text-gold hover:underline"
                  >
                    {t("plus.card.manage")}
                  </a>
                </p>
              )}
            </div>
            <DeleteAccountForm />
          </section>
        </div>
      </div>
    </div>
  );
}
