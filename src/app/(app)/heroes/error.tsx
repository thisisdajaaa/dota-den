"use client";

import { ErrorPanel } from "@/components/error-panel";
import { useT } from "@/common/i18n/client";

export default function HeroesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  return <ErrorPanel error={error} retry={retry} title={t("heroes.index.error")} />;
}
