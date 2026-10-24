import Link from "next/link";
import { Fragment } from "react";
import { LOCALE_TAGS } from "@/common/i18n/locales";
import { getLocale, getT } from "@/common/i18n/server";
import { PageHeader } from "@/components/page-header";

/**
 * One legal page (terms, refund policy, privacy policy): title, last-updated date, its
 * sections and a contact section. Texts are messages under `<prefix>.sections.<key>`: a
 * `title`, a `body` and, for sections listed with `items`, one `items.<item>` line each.
 * `{account}` in a text becomes a link to the Account page.
 */
export interface LegalSection {
  key: string;
  items?: readonly string[];
}

type Prefix = "plus.terms" | "plus.refunds" | "privacy.policy";

/** Splits a text on `{account}` and links it to the Account page. */
function withAccountLink(text: string, label: string) {
  const parts = text.split("{account}");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <Link href="/account" className="text-gold hover:underline">
          {label}
        </Link>
      )}
      {part}
    </Fragment>
  ));
}

export async function LegalDocument({
  id,
  prefix,
  updated,
  sections,
  supportEmail,
}: {
  /** Prefix for heading ids, e.g. "privacy". */
  id: string;
  prefix: Prefix;
  /** When the texts last changed (YYYY-MM-DD), shown under the title. */
  updated: string;
  sections: readonly LegalSection[];
  /** SUPPORT_EMAIL, or null when no contact address is configured. */
  supportEmail: string | null;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const text = (key: string, vars?: Record<string, string>) => t(`${prefix}.${key}` as never, vars);
  const accountLabel = t("common.legal.accountLink");
  const date = new Date(updated).toLocaleDateString(LOCALE_TAGS[locale], {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const [beforeEmail, afterEmail = ""] = t("common.legal.contact.email").split("{email}");
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        kicker={text("kicker")}
        title={text("title")}
        description={text("updated", { date })}
      />
      <div className="panel space-y-6 p-6 sm:p-8">
        {sections.map(({ key, items }) => (
          <section key={key} aria-labelledby={`${id}-${key}`} className="space-y-1.5">
            <h2 id={`${id}-${key}`} className="font-semibold">
              {text(`sections.${key}.title`)}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {withAccountLink(text(`sections.${key}.body`), accountLabel)}
            </p>
            {items && (
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-gold/60">
                {items.map((item) => (
                  <li key={item}>
                    {withAccountLink(text(`sections.${key}.items.${item}`), accountLabel)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <section aria-labelledby={`${id}-contact`} className="space-y-1.5">
          <h2 id={`${id}-contact`} className="font-semibold">
            {t("common.legal.contact.title")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {supportEmail ? (
              <>
                {beforeEmail}
                <a href={`mailto:${supportEmail}`} className="text-gold hover:underline">
                  {supportEmail}
                </a>
                {withAccountLink(afterEmail, accountLabel)}
              </>
            ) : (
              withAccountLink(t("common.legal.contact.fallback"), accountLabel)
            )}
          </p>
        </section>
      </div>
    </article>
  );
}
