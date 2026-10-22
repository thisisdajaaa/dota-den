"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";
import { useReportError } from "./report-error";

/** Shared body for error pages: explains, reports the error, and offers a retry. */
export function ErrorPanel({
  error,
  retry,
  title,
  homeLink = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
  /** Also offer a way home (when the whole page failed, not one section of it). */
  homeLink?: boolean;
}) {
  const t = useT();
  useReportError(error);
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
      <AlertTriangle aria-hidden className="size-8 text-loss" />
      <h1 className="text-lg font-semibold">{title ?? t("system.error.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("system.error.body")}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <Button type="button" onClick={() => retry()}>
          {t("system.error.retry")}
        </Button>
        {homeLink && (
          <Button asChild variant="outline">
            <Link href="/">{t("system.error.home")}</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
