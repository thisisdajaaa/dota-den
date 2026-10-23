"use client";

import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { useLocale, useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import type { PlanDto, PlusOfferDto } from "../dtos/responses/plus.dto";
import { formatBillingDate } from "./format";
import { PlusBadge } from "./plus-badge";

/** The account page's "Your plan" card: free or Plus, renewal or end date, manage link. */
export function PlanCard({ plan, offer }: { plan: PlanDto; offer: PlusOfferDto }) {
  const t = useT();
  const locale = useLocale();
  const day = (iso: string | null) => (iso ? formatBillingDate(iso, locale) : "");

  let line: string | null = null;
  if (plan.reason === "disabled" && plan.status) line = t("plus.card.disabled");
  else if (plan.reason === "cancelled_until_period_end")
    line = t("plus.card.cancelled", { date: day(plan.until) });
  else if (plan.reason === "grace") line = t("plus.card.grace", { date: day(plan.until) });
  else if (plan.reason === "active" && plan.renewsAt)
    line = t("plus.card.renews", { date: day(plan.renewsAt) });
  else if (plan.reason === "trial") line = t("plus.card.trial");
  else if (!plan.plus && plan.status === "paused") line = t("plus.card.paused");
  else if (!plan.plus && plan.status) line = t("plus.card.ended");

  return (
    <section id="plan" className="panel space-y-4 p-5" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="plan-title" className="text-lg font-semibold">
            {t("plus.card.title")}
          </h2>
          <p className="flex items-center gap-2 text-sm">
            {plan.plus ? (
              <>
                <span className="font-display font-semibold tracking-wide text-gold">
                  {t("plus.card.plusName")}
                </span>
                <PlusBadge />
                {plan.plan && (
                  <span className="text-xs text-muted-foreground">
                    {t(`plus.card.plan.${plan.plan}`)}
                  </span>
                )}
              </>
            ) : (
              <span className="font-semibold">{t("plus.card.free")}</span>
            )}
            {plan.status && (
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[0.65rem] text-muted-foreground ring-1 ring-white/10">
                {t(`plus.card.status.${plan.status}`)}
              </span>
            )}
          </p>
        </div>
      </div>

      {line ? (
        <p className="text-sm text-muted-foreground" role="status">
          {line}
        </p>
      ) : (
        !plan.plus && <p className="text-sm text-muted-foreground">{t("plus.card.freeBody")}</p>
      )}
      {plan.plus && <p className="text-xs text-muted-foreground">{t("plus.card.alertsOn")}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {plan.canManage && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            {/* Full navigation: the route redirects to the provider's portal. */}
            <a href="/api/v1/me/plus/portal" title={t("plus.card.manageHint")}>
              <ExternalLink aria-hidden className="size-4" /> {t("plus.card.manage")}
            </a>
          </Button>
        )}
        {!plan.plus && offer.status === "available" && (
          <Button asChild size="sm" className="gap-2">
            <Link href="/plus">
              <Sparkles aria-hidden className="size-4" /> {t("plus.card.see")}
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
