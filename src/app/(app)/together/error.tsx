"use client";

import { useT } from "@/common/i18n/client";
import { ErrorPanel } from "@/components/error-panel";

export default function TogetherError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  return <ErrorPanel error={error} retry={retry} title={t("together.page.error")} />;
}
