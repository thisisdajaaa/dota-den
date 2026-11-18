import { LegalDocument } from "@/components/legal-document";
import type { BillingProviderName } from "../domain/subscription";

/*
 * DRAFT: the terms of use and the refund policy are plain-language drafts written for the owner
 * to review (with the payment provider's buyer terms and refund policy in hand) before Plus
 * goes on sale. With BILLING_PROVIDER=polar the payment and refund sections name Polar (the
 * `polar` texts); otherwise they say "our payment provider". They are not legal advice.
 * Texts: src/common/i18n/messages/<lang>/plus.ts. The contact section comes from
 * SUPPORT_EMAIL (src/components/legal-document.tsx).
 */

/** When the texts last changed (shown on the page). Update with every edit. */
export const LEGAL_UPDATED = "2026-11-18";

const SECTIONS = {
  terms: ["about", "account", "data", "free", "payments", "billing", "changes", "warranty"],
  refunds: ["who", "cancel", "request", "after", "rights"],
} as const;

/** Sections with a text that names the provider, per provider. */
const NAMED: Partial<Record<BillingProviderName, readonly string[]>> = {
  polar: ["payments", "who", "request"],
};

/** One legal document: title, last-updated date, its sections and how to reach us. */
export function LegalPage({
  doc,
  supportEmail,
  provider,
}: {
  doc: keyof typeof SECTIONS;
  supportEmail: string | null;
  /** The configured payment provider (BILLING_PROVIDER), named where it has its own text. */
  provider: BillingProviderName | null;
}) {
  const named = (provider && NAMED[provider]) || [];
  return (
    <LegalDocument
      id={doc}
      prefix={`plus.${doc}`}
      updated={LEGAL_UPDATED}
      sections={SECTIONS[doc].map((key) =>
        provider && named.includes(key) ? { key, body: provider } : { key },
      )}
      supportEmail={supportEmail}
    />
  );
}
