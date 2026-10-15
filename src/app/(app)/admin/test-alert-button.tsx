"use client";

import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/common/i18n/client";
import { sendTestAlert } from "./actions";

/** Sends a test owner alert (admin only) and says where it went. */
export function TestAlertButton() {
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
            const res = await sendTestAlert();
            if (!res.ok) return setResult(res.error);
            const webhook = t(`admin.alerts.webhook.${res.webhook}`);
            setResult(
              res.devices > 0
                ? t("admin.alerts.testSent", { devices: res.devices, webhook })
                : t("admin.alerts.testNoDevices", { webhook }),
            );
          })
        }
      >
        <BellRing aria-hidden className="size-4" />
        {pending ? t("admin.alerts.sending") : t("admin.alerts.test")}
      </Button>
      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {result}
        </p>
      )}
    </div>
  );
}
