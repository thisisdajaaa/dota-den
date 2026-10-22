import type { Metadata } from "next";
import { getT } from "@/common/i18n/server";
import { LegalPage } from "@/modules/plus/ui/legal-page";

// DRAFT for the owner to review before Plus goes on sale (see src/modules/plus/ui/legal-page.tsx).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("plus.refunds.title") };
}

export default function Page() {
  return <LegalPage doc="refunds" />;
}
