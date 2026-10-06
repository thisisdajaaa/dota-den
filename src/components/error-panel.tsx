"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";
import { useReportError } from "./report-error";

/** Shared body for error pages: explains, reports the error, and offers a retry. */
export function ErrorPanel({
  error,
  retry,
  title,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
}) {
  const t = useT();
  useReportError(error);
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
      <AlertTriangle aria-hidden className="size-8 text-loss" />
      <h1 className="text-lg font-semibold">{title ?? t("system.error.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("system.error.body")}</p>
      <Button type="button" onClick={() => retry()}>
        {t("system.error.retry")}
      </Button>
    </section>
  );
}
