"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";
import { setUpSchedulesNow } from "./actions";

/** Creates or updates the 5-minute job schedules (QStash) for this deployment (admin only). */
export function SchedulesButton() {
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
            const res = await setUpSchedulesNow();
            if (!res.ok) return setResult(res.error);
            setResult(
              res.schedules === null
                ? t("admin.cron.schedulesOff")
                : t("admin.cron.schedulesDone", { n: res.schedules }),
            );
          })
        }
      >
        <CalendarClock aria-hidden className="size-4" />
        {pending ? t("admin.cron.schedulesPending") : t("admin.cron.schedules")}
      </Button>
      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      )}
    </div>
  );
}
