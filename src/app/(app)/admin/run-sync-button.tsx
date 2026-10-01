"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runMatchSyncNow } from "./actions";

/** Runs the daily match sync now (admin only) and says what happened. */
export function RunSyncButton() {
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
                ? `Done in ${Math.round(res.run.durationMs / 1000)}s: ${res.run.synced} synced, ${res.run.backfilling} still importing, ${res.run.failed.length} failed, ${res.run.skipped} skipped.`
                : res.error,
            );
          })
        }
      >
        <RefreshCw aria-hidden className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Syncing everyone… (up to a minute)" : "Run match sync now"}
      </Button>
      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      )}
    </div>
  );
}
