"use client";

import { useT } from "@/common/i18n/client";
import { ErrorPanel } from "@/components/error-panel";

export default function PlayersError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();
  return <ErrorPanel error={error} retry={retry} title={t("players.page.error")} />;
}
