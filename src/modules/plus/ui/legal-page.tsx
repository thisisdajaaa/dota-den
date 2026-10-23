import { getLocale, getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";
import { formatBillingDate } from "./format";

/*
 * DRAFT: the terms of use and the refund policy are plain-language drafts written for the owner
 * to review (with Lemon Squeezy's buyer terms and refund policy in hand) before Plus goes on
 * sale. They are not legal advice. Texts: src/common/i18n/messages/<lang>/plus.ts.
 */

/** When the texts last changed (shown on the page). Update with every edit. */
export const LEGAL_UPDATED = "2026-10-23";

const SECTIONS = {
  terms: ["about", "account", "data", "free", "payments", "billing", "changes", "warranty"],
  refunds: ["who", "cancel", "request", "after", "rights"],
} as const;

/** One legal document: title, last-updated date and its sections. */
export async function LegalPage({ doc }: { doc: keyof typeof SECTIONS }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        kicker={t(`plus.${doc}.kicker`)}
        title={t(`plus.${doc}.title`)}
        description={t(`plus.${doc}.updated`, { date: formatBillingDate(LEGAL_UPDATED, locale) })}
      />
      <div className="panel space-y-6 p-6 sm:p-8">
        {SECTIONS[doc].map((key) => (
          <section key={key} aria-labelledby={`${doc}-${key}`} className="space-y-1.5">
            <h2 id={`${doc}-${key}`} className="font-semibold">
              {t(`plus.${doc}.sections.${key}.title` as never)}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(`plus.${doc}.sections.${key}.body` as never)}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
