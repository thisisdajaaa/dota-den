"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { TokenOutcomeDto } from "../dtos/responses/email-status.dto";

/**
 * The button on the confirmation and unsubscribe pages. Opening the link does nothing by
 * itself (mail scanners open links too); the click does. Works signed-out.
 */
export function EmailLinkAction({
  action,
  token,
}: {
  action: "confirm" | "unsubscribe";
  token: string;
}) {
  const t = useT();
  const [outcome, setOutcome] = useState<TokenOutcomeDto["outcome"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<TokenOutcomeDto>(
        `/api/v1/email/${action}?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      setOutcome(res.outcome);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("email.link.failed"));
    } finally {
      setBusy(false);
    }
  }

  if (outcome) {
    const text =
      outcome === "confirmed"
        ? t("email.link.confirmed")
        : outcome === "unsubscribed"
          ? t("email.link.unsubscribed")
          : outcome === "stale"
            ? t("email.link.stale")
            : t("email.link.invalid");
    return (
      <div className="space-y-3">
        <p role="status" className="text-sm">
          {text}
        </p>
        <Link href="/account#email" className="text-sm text-gold hover:underline">
          {t("email.link.account")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={busy}>
        {action === "confirm" ? t("email.link.confirmButton") : t("email.link.unsubscribeButton")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
