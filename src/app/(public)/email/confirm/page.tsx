import type { Metadata } from "next";
import { getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { EmailLinkAction } from "@/modules/email/ui/email-link-action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // The token is in the URL: keep it out of search engines and Referer headers.
  return { title: t("email.link.confirmTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/** Opened from the link in an email; signed-out is fine. */
export default async function EmailConfirmPage({ searchParams }: PageProps<"/email/confirm">) {
  const { token } = await searchParams;
  const t = await getT();
  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <PageHeader
        kicker={t("email.card.title")}
        title={t("email.link.confirmTitle")}
        description={t("email.link.confirmText")}
      />
      <section className="panel p-5">
        {typeof token === "string" && token.length >= 10 ? (
          <EmailLinkAction action="confirm" token={token} />
        ) : (
          <p role="status" className="text-sm">
            {t("email.link.missing")}
          </p>
        )}
      </section>
    </div>
  );
}
