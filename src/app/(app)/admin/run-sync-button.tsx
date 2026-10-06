"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";
import { runMatchSyncNow } from "./actions";

/** Runs the daily match sync now (admin only) and says what happened. */
export function RunSyncButton() {
  const t = useT();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const res = await runMatchSyncNow();
            setResult(
              res.ok
                ? t("admin.cron.done", {
                    seconds: Math.round(res.run.durationMs / 1000),
                    synced: res.run.synced,
                    importing: res.run.backfilling,
                    failed: res.run.failed.length,
                    skipped: res.run.skipped,
                  })
                : res.error,
            );
          })
        }
      >
        <RefreshCw aria-hidden className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? t("admin.cron.syncing") : t("admin.cron.run")}
      </Button>
      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      )}
    </div>
  );
}
