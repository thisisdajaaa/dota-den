import type { Metadata } from "next";
import { env } from "@/common/config/env";
import { getT } from "@/common/i18n/server";
import { PrivacyPolicy } from "@/modules/privacy/ui/privacy-policy";

// DRAFT for the owner to review (see src/modules/privacy/ui/privacy-policy.tsx). Not legal advice.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("privacy.policy.title"),
    description: t("privacy.policy.description"),
    alternates: { canonical: "/privacy" },
  };
}

export default function Page() {
  return <PrivacyPolicy supportEmail={env().SUPPORT_EMAIL ?? null} />;
}
