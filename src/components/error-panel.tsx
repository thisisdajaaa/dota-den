"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportError } from "./report-error";

/** Shared body for error pages: explains, reports the error, and offers a retry. */
export function ErrorPanel({
  error,
  retry,
  title = "Something went wrong",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
}) {
  useReportError(error);
  return (
    <section className="panel grid place-items-center gap-3 px-6 py-16 text-center" role="alert">
      <AlertTriangle aria-hidden className="size-8 text-loss" />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This is on our side, not yours, and we&apos;ve been told about it. Try again in a moment.
      </p>
      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>
    </section>
  );
}
