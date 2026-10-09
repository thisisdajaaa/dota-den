import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/modules/identity";
import { notificationService, vapidPublicKey } from "@/modules/notifications";
import { NotificationsCard } from "@/modules/notifications/ui/notifications-card";
import { sharesService } from "@/modules/shares";
import { SharedLinks } from "@/modules/shares/ui/shared-links";
import { DeleteAccountForm } from "@/modules/privacy/ui/delete-account-form";
import { getT } from "@/common/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("privacy.title") };
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getT();
  const [notifications, shares] = await Promise.all([
    notificationService.status(user.id),
    sharesService.list(user.id),
  ]);
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

      <NotificationsCard
        publicKey={vapidPublicKey()}
        endpoints={notifications.endpoints}
        prefs={notifications.prefs}
      />

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
          </ul>
        </div>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
