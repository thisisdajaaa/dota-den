"use client";

import Link from "next/link";
import { useState } from "react";
import { Gift } from "lucide-react";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { ReferralClaimDto } from "../dtos/responses/plus.dto";

const REASONS = [
  "own_code",
  "not_new",
  "already_referred",
  "had_plus",
  "unavailable",
  "unknown_code",
] as const;
type ErrorKey = (typeof REASONS)[number] | "tooMany" | "signIn" | "network" | "down";

function claimError(e: unknown): ErrorKey {
  if (!(e instanceof ApiClientError)) return "network";
  if (e.status === 401) return "signIn";
  if (e.status === 429) return "tooMany";
  const reason = (e.details as { reason?: string } | undefined)?.reason;
  return REASONS.find((r) => r === reason) ?? "down";
}

/** The signed-in friend claims the invite; "waiting" can be checked again later. */
export function ClaimInvite({ code }: { code: string }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ReferralClaimDto["status"] | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);

  const claim = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await apiRequest<ReferralClaimDto>("/api/v1/plus/referrals/claim", {
        method: "POST",
        body: { code },
      });
      setStatus(res.status);
    } catch (e) {
      setError(claimError(e));
    } finally {
      setPending(false);
    }
  };

  if (status === "rewarded" || status === "expired")
    return (
      <div className="space-y-3">
        <p className="text-sm" role="status">
          {t(`plus.referral.${status}`)}
        </p>
        <Button asChild size="sm">
          <Link href="/dashboard">{t("plus.referral.toDashboard")}</Link>
        </Button>
      </div>
    );

  return (
    <div className="space-y-3">
      {status === "waiting" && (
        <p className="text-sm" role="status">
          {t("plus.referral.waiting")}
        </p>
      )}
      {error && (
        <p className="text-sm text-loss" role="alert">
          {t(`plus.referral.error.${error}`)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {status === "waiting" ? (
          <>
            <Button asChild size="sm">
              <Link href="/dashboard">{t("plus.referral.toDashboard")}</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={claim} disabled={pending}>
              {t("plus.referral.check")}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={claim} disabled={pending} className="gap-2">
            <Gift aria-hidden className="size-4" />
            {pending ? t("plus.referral.claiming") : t("plus.referral.claim")}
          </Button>
        )}
      </div>
    </div>
  );
}
