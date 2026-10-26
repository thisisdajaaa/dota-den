import { LegalDocument, type LegalSection } from "@/components/legal-document";

/*
 * DRAFT: the privacy policy is a plain-language draft for the owner to review. It is not legal
 * advice. It describes what the code stores and who processes it, as of the date below:
 *   - what's stored: every PersonalDataPart in src/modules/privacy/privacy.container.ts (the
 *     same list the data export and account deletion use) and the collections in
 *     scripts/ensure-indexes.ts;
 *   - how long: the TTL indexes in the repositories (e.g. 90-day notification, email and
 *     Discord logs; 30-day sessions, error events and profile snapshots) and the nightly
 *     encrypted backups kept 30 days (docs/operations.md);
 *   - cookies: dd_session, dd_oid_state, dd_oid_next, dd_lang, dd_tz (no analytics or ads).
 * Update the texts (src/common/i18n/messages/<lang>/privacy.ts, `policy`) and PRIVACY_UPDATED
 * whenever a feature starts storing something new or a new service is added.
 */

/** When the texts last changed (shown on the page). Update with every edit. */
export const PRIVACY_UPDATED = "2026-10-26";

const SECTIONS: readonly LegalSection[] = [
  { key: "summary" },
  { key: "signIn" },
  {
    key: "stored",
    items: [
      "account",
      "sessions",
      "matches",
      "mmr",
      "notes",
      "follows",
      "drafts",
      "groups",
      "together",
      "shares",
      "coach",
    ],
  },
  { key: "optional", items: ["notifications", "email", "discord", "plus"] },
  { key: "visibility" },
  { key: "device", items: ["session", "signIn", "language", "timeZone", "local"] },
  {
    key: "services",
    items: [
      "vercel",
      "mongodb",
      "upstash",
      "github",
      "opendota",
      "stratz",
      "steam",
      "groq",
      "lemonSqueezy",
      "resend",
      "push",
      "discord",
      "streams",
    ],
  },
  { key: "logs" },
  { key: "retention", items: ["account", "sessions", "logs", "caches", "backups"] },
  { key: "control" },
  { key: "changes" },
];

/** The privacy policy (/privacy). */
export function PrivacyPolicy({ supportEmail }: { supportEmail: string | null }) {
  return (
    <LegalDocument
      id="privacy"
      prefix="privacy.policy"
      updated={PRIVACY_UPDATED}
      sections={SECTIONS}
      supportEmail={supportEmail}
    />
  );
}
