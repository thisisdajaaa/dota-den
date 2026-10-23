"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Bell,
  Bot,
  Check,
  Clock,
  HeartHandshake,
  Layers,
  PauseCircle,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { SteamIcon } from "@/components/icons/steam-icon";
import { signInHref } from "@/modules/identity/domain/return-path";
import { PLAN_PRICES, type Plan } from "../domain/plans";
import type { PlanDto, PlusOfferDto } from "../dtos/responses/plus.dto";
import { PlusBadge } from "./plus-badge";

const FREE_KEYS = [
  "matches",
  "mmr",
  "draft",
  "community",
  "live",
  "notifications",
  "coach",
] as const;

const PERKS: ReadonlyArray<{
  key: "coach" | "sync" | "alerts" | "badge" | "limits" | "thanks";
  icon: LucideIcon;
}> = [
  { key: "coach", icon: Bot },
  { key: "sync", icon: Zap },
  { key: "alerts", icon: Bell },
  { key: "badge", icon: BadgeCheck },
  { key: "limits", icon: Layers },
  { key: "thanks", icon: HeartHandshake },
];

export interface PlusLimits {
  players: number;
  streamers: number;
  groups: number;
}

/**
 * The /plus page body: honest about what stays free, what Plus adds and how billing works.
 * Checkout buttons only render when Plus is on sale; they go through our checkout route, which
 * attaches the signed-in player's id on the server.
 */
export function PlusPricing({
  offer,
  signedIn,
  plan,
  limits,
}: {
  offer: PlusOfferDto;
  signedIn: boolean;
  /** The viewer's plan when signed in. */
  plan: PlanDto | null;
  /** Plus's limits (already doubled). */
  limits: PlusLimits;
}) {
  const t = useT();
  const available = offer.status === "available";

  return (
    <div className="space-y-8">
      <section aria-labelledby="plus-title" className="panel relative overflow-hidden p-6 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-gold/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 size-72 rounded-full bg-[oklch(0.45_0.12_45/0.25)] blur-3xl"
        />
        <div className="relative max-w-2xl space-y-3">
          <p className="kicker">{t("plus.page.kicker")}</p>
          <h1
            id="plus-title"
            className="flex flex-wrap items-center gap-3 font-display text-4xl font-bold tracking-wide sm:text-5xl"
          >
            <span>
              Dota Den <span className="text-gold">Plus</span>
            </span>
          </h1>
          <p className="text-base text-muted-foreground">{t("plus.page.lead")}</p>
        </div>
      </section>

      {offer.status === "off" && (
        <Banner icon={Clock} title={t("plus.page.comingSoonTitle")}>
          {t("plus.page.comingSoonBody")}
        </Banner>
      )}
      {offer.status === "paused" && (
        <Banner icon={PauseCircle} title={t("plus.page.pausedTitle")}>
          {t("plus.page.pausedBody")}
        </Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="plus-free" className="panel space-y-4 p-6">
          <h2 id="plus-free" className="text-lg font-semibold">
            {t("plus.page.freeTitle")}
          </h2>
          <ul className="space-y-2.5">
            {FREE_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2.5 text-sm">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-win" />
                <span>{t(`plus.page.free.${k}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="plus-perks" className="space-y-4">
          <h2 id="plus-perks" className="flex items-center gap-2 text-lg font-semibold">
            {t("plus.page.plusTitle")} <PlusBadge />
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PERKS.map(({ key, icon: Icon }) => (
              <li key={key} className="panel space-y-1.5 p-4">
                <p className="flex items-center gap-2 font-medium">
                  <Icon aria-hidden className="size-4 text-gold" />
                  {t(`plus.page.perks.${key}.title`)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(`plus.page.perks.${key}.body`, {
                    players: limits.players,
                    streamers: limits.streamers,
                    groups: limits.groups,
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {available && (
        <section aria-labelledby="plus-plans" className="space-y-4">
          <h2 id="plus-plans" className="sr-only">
            {t("plus.page.subscribe")}
          </h2>
          {plan?.plus ? (
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="flex items-center gap-2 font-medium" role="status">
                <Sparkles aria-hidden className="size-4 text-gold" /> {t("plus.page.youHavePlus")}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/account#plan">{t("plus.page.manage")}</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {offer.plans.map((p) => (
                <PlanOption key={p} plan={p} signedIn={signedIn} featured={p === "yearly"} />
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-label={t("plus.page.faqTitle")} className="grid gap-6 lg:grid-cols-2">
        <ul className="panel space-y-3 p-6 text-sm text-muted-foreground">
          <li>{t("plus.page.notes.provider")}</li>
          <li>{t("plus.page.notes.cancel")}</li>
          <li>{t("plus.page.notes.currency")}</li>
          <li>
            <LegalLinks />
          </li>
        </ul>
        <div className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">{t("plus.page.faqTitle")}</h2>
          <dl className="space-y-4 text-sm">
            {(["free", "cancel", "fail", "limits"] as const).map((q) => (
              <div key={q} className="space-y-1">
                <dt className="font-medium">{t(`plus.page.faq.${q}Q`)}</dt>
                <dd className="text-muted-foreground">{t(`plus.page.faq.${q}A`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}

function Banner({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section role="status" className="panel flex items-start gap-3 border-gold/30 p-5">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </section>
  );
}

function PlanOption({
  plan,
  signedIn,
  featured,
}: {
  plan: Plan;
  signedIn: boolean;
  featured: boolean;
}) {
  const t = useT();
  const price = PLAN_PRICES[plan];
  return (
    <article
      aria-labelledby={`plan-${plan}`}
      className={cn(
        "panel flex flex-col gap-4 p-6",
        featured && "shadow-[0_0_40px_-12px_oklch(0.8_0.13_80/0.45)] ring-1 ring-gold/50",
      )}
    >
      <div className="space-y-1">
        <h3 id={`plan-${plan}`} className="kicker">
          {t(`plus.page.${plan}`)}
        </h3>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tabular-nums">{price.amount}</span>
          <span className="text-sm text-muted-foreground">
            {plan === "monthly" ? t("plus.page.perMonth") : t("plus.page.perYear")}
          </span>
        </p>
        {plan === "yearly" && <p className="text-xs text-gold/90">{t("plus.page.yearlySaving")}</p>}
      </div>
      <Button
        asChild
        size="lg"
        variant={featured ? "default" : "outline"}
        // Long translations wrap inside the button rather than run off the card.
        className="mt-auto h-auto min-h-9 gap-2 py-2 text-center whitespace-normal"
      >
        {signedIn ? (
          // Full navigation: the route redirects to the provider's hosted checkout.
          <a href={`/api/v1/plus/checkout?plan=${plan}`}>
            <Sparkles aria-hidden className="size-4" />
            {plan === "monthly" ? t("plus.page.subscribeMonthly") : t("plus.page.subscribeYearly")}
          </a>
        ) : (
          <a href={signInHref("/plus")}>
            <SteamIcon className="size-4" /> {t("plus.page.signIn")}
          </a>
        )}
      </Button>
    </article>
  );
}

/** "Read the terms and the refund policy." with both words linked. */
export function LegalLinks() {
  const t = useT();
  const [before, middle, after] = t("plus.page.legal").split(/\{terms\}|\{refunds\}/);
  return (
    <span>
      {before}
      <Link href="/terms" className="text-gold hover:underline">
        {t("plus.page.termsLink")}
      </Link>
      {middle}
      <Link href="/refunds" className="text-gold hover:underline">
        {t("plus.page.refundsLink")}
      </Link>
      {after}
    </span>
  );
}
