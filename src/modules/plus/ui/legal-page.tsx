import { LegalDocument } from "@/components/legal-document";

/*
 * DRAFT: the terms of use and the refund policy are plain-language drafts written for the owner
 * to review (with Lemon Squeezy's buyer terms and refund policy in hand) before Plus goes on
 * sale. They are not legal advice. Texts: src/common/i18n/messages/<lang>/plus.ts. The contact
 * section comes from SUPPORT_EMAIL (src/components/legal-document.tsx).
 */

/** When the texts last changed (shown on the page). Update with every edit. */
export const LEGAL_UPDATED = "2026-10-27";

const SECTIONS = {
  terms: ["about", "account", "data", "free", "payments", "billing", "changes", "warranty"],
  refunds: ["who", "cancel", "request", "after", "rights"],
} as const;

/** One legal document: title, last-updated date, its sections and how to reach us. */
export function LegalPage({
  doc,
  supportEmail,
}: {
  doc: keyof typeof SECTIONS;
  supportEmail: string | null;
}) {
  return (
    <LegalDocument
      id={doc}
      prefix={`plus.${doc}`}
      updated={LEGAL_UPDATED}
      sections={SECTIONS[doc].map((key) => ({ key }))}
      supportEmail={supportEmail}
    />
  );
}
