"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Bot,
  BotMessageSquare,
  Check,
  Clock,
  Gift,
  FileText,
  Gauge,
  Hammer,
  HeartHandshake,
  Layers,
  MapPin,
  PauseCircle,
  Sparkles,
  Timer,
  Zap,
  type LucideIcon,
  Swords,
  ChartColumn,
} from "lucide-react";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useLocale, useT } from "@/common/i18n/client";
import { Button } from "@/components/ui/button";
import { SteamIcon } from "@/components/icons/steam-icon";
import { signInHref } from "@/modules/identity/domain/return-path";
import { PLAN_PRICES, PLANS as PLAN_ORDER, type Plan } from "../domain/plans";
import type { PlanDto, PlusOfferDto } from "../dtos/responses/plus.dto";
import { formatBillingDate } from "./format";
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

type PerkKey =
  | "coach"
  | "ask"
  | "compare"
  | "coaching"
  | "buildCheck"
  | "postMortem"
  | "splits"
  | "read"
  | "pick"
  | "session"
  | "sync"
  | "alerts"
  | "badge"
  | "limits"
  | "thanks";

/** Each perk links to where it lives; the card says how to get there. */
const PERKS: ReadonlyArray<{ key: PerkKey; icon: LucideIcon; href?: string }> = [
  // AI and coaching first: they're what Plus pays for. Convenience perks after.
  { key: "coach", icon: Bot, href: "/matches" },
  { key: "ask", icon: BotMessageSquare, href: "/ask" },
  { key: "read", icon: FileText, href: "/report" },
  { key: "pick", icon: Sparkles, href: "/draft/pick" },
  { key: "postMortem", icon: Swords, href: "/matches" },
  { key: "coaching", icon: Timer, href: "/heroes" },
  { key: "buildCheck", icon: Hammer, href: "/heroes" },
  { key: "compare", icon: Gauge, href: "/heroes/compare" },
  { key: "splits", icon: ChartColumn, href: "/heroes/splits" },
  { key: "session", icon: Activity, href: "/account#notifications" },
  { key: "sync", icon: Zap, href: "/dashboard" },
  { key: "alerts", icon: Bell, href: "/live" },
  { key: "badge", icon: BadgeCheck, href: "/leaderboards" },
  { key: "limits", icon: Layers, href: "/players" },
  { key: "thanks", icon: HeartHandshake },
];

export interface PlusLimits {
  players: number;
  streamers: number;
  groups: number;
  /** Ask Den questions a day: free and with Plus. */
  askFree: number;
  askPlus: number;
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

      {plan?.reason === "staff" ? (
        <Banner icon={Sparkles} title={t("plus.page.staffTitle")}>
          {t("plus.page.staffBody")}
        </Banner>
      ) : (
        offer.status === "off" && (
          <Banner icon={Clock} title={t("plus.page.comingSoonTitle")}>
            {t("plus.page.comingSoonBody")}
          </Banner>
        )
      )}
      {offer.status === "paused" && plan?.reason !== "staff" && (
        <Banner icon={PauseCircle} title={t("plus.page.pausedTitle")}>
          {t("plus.page.pausedBody")}
        </Banner>
      )}

      {available && (!signedIn || plan?.trial.status === "available") && (
        <TrialOffer signedIn={signedIn} />
      )}
      {available && plan?.trial.status === "active" && plan.trial.endsAt && (
        <TrialRunning endsAt={plan.trial.endsAt} />
      )}

      {!available && (
        // Not on sale yet: still show what it will cost, without a way to buy.
        <section aria-labelledby="plus-plans" className="space-y-4">
          <h2 id="plus-plans" className="sr-only">
            {t("plus.page.plansTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLAN_ORDER.map((p) => (
              <PlanOption key={p} plan={p} signedIn={signedIn} featured={p === "yearly"} preview />
            ))}
          </div>
        </section>
      )}

      {available && (
        <section aria-labelledby="plus-plans" className="space-y-4">
          <h2 id="plus-plans" className="sr-only">
            {t("plus.page.subscribe")}
          </h2>
          {plan?.plus && plan.reason === "staff" ? null : plan?.plus &&
            plan.reason !== "free_trial" &&
            plan.reason !== "referral" ? (
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="flex items-center gap-2 font-medium" role="status">
                <Sparkles aria-hidden className="size-4 text-gold" /> {t("plus.page.youHavePlus")}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/account#plan">{t("plus.page.manage")}</Link>
              </Button>
            </div>
          ) : plan?.stillBills ? (
            // A renewal that failed (or a paused plan) is still a subscription: fix it, don't
            // buy a second one.
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="max-w-xl text-sm" role="status">
                {t("plus.page.stillBilling")}
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

      {available && <InviteOffer signedIn={signedIn} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section
          aria-labelledby="plus-free"
          className="panel space-y-4 self-start p-6 lg:sticky lg:top-6"
        >
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
            {PERKS.map(({ key, icon: Icon, href }) => {
              const body = (
                <>
                  <p className="flex items-center gap-2 font-medium">
                    <Icon aria-hidden className="size-4 shrink-0 text-gold" />
                    {t(`plus.page.perks.${key}.title`, { plus: limits.askPlus })}
                    {href && (
                      <ArrowUpRight
                        aria-hidden
                        className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-gold"
                      />
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(`plus.page.perks.${key}.body`, {
                      players: limits.players,
                      streamers: limits.streamers,
                      groups: limits.groups,
                      free: limits.askFree,
                      plus: limits.askPlus,
                    })}
                  </p>
                  <p className="mt-auto flex gap-1.5 border-t border-white/[0.06] pt-2 text-xs text-foreground/90">
                    <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-gold" />
                    <span>{t(`plus.page.perks.${key}.where`)}</span>
                  </p>
                </>
              );
              return (
                <li key={key}>
                  {href ? (
                    <Link
                      href={href}
                      className="panel group flex h-full flex-col gap-1.5 p-4 transition-colors hover:border-gold/40 hover:bg-gold/[0.04] focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:outline-none"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="panel flex h-full flex-col gap-1.5 p-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section aria-label={t("plus.page.faqTitle")} className="grid gap-6 lg:grid-cols-2">
        <ul className="panel space-y-3 p-6 text-sm text-muted-foreground">
          <li>
            {offer.provider === "polar"
              ? t("plus.page.notes.providerPolar")
              : t("plus.page.notes.provider")}
          </li>
          <li>{t("plus.page.notes.cancel")}</li>
          <li>
            {offer.provider === "polar"
              ? t("plus.page.notes.currencyPolar")
              : t("plus.page.notes.currency")}
          </li>
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
  preview = false,
}: {
  plan: Plan;
  signedIn: boolean;
  featured: boolean;
  /** Not on sale yet: the price, and a disabled button instead of a checkout. */
  preview?: boolean;
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
      {preview ? (
        <Button size="lg" variant="outline" disabled className="mt-auto">
          {t("plus.page.opensSoon")}
        </Button>
      ) : signedIn ? (
        <CheckoutButton plan={plan} featured={featured} />
      ) : (
        <Button
          asChild
          size="lg"
          variant={featured ? "default" : "outline"}
          className={PLAN_BUTTON_CLASS}
        >
          <a href={signInHref("/plus")}>
            <SteamIcon className="size-4" /> {t("plus.page.signIn")}
          </a>
        </Button>
      )}
    </article>
  );
}

// Long translations wrap inside the button rather than run off the card.
const PLAN_BUTTON_CLASS = "mt-auto h-auto min-h-9 gap-2 py-2 text-center whitespace-normal";

/** Errors the server answers when starting a checkout, as messages in the player's language. */
function checkoutError(e: unknown): CheckoutErrorKey {
  if (!(e instanceof ApiClientError)) return "network";
  if (e.status === 409) return "hasPlus";
  if (e.status === 404) return "unavailable";
  if (e.status === 429) return "tooMany";
  if (e.status === 401) return "signIn";
  return "down";
}
type CheckoutErrorKey = "network" | "hasPlus" | "unavailable" | "tooMany" | "signIn" | "down";

/**
 * Starts a checkout: asks our server (same-origin POST) to create it with the signed-in
 * player's id attached, then navigates to the provider's hosted checkout. A failure stays on
 * the page with a message, nothing is charged.
 */
function CheckoutButton({ plan, featured }: { plan: Plan; featured: boolean }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CheckoutErrorKey | null>(null);
  const start = async () => {
    setPending(true);
    setError(null);
    try {
      const { url } = await apiRequest<{ url: string }>("/api/v1/plus/checkout", {
        body: { plan },
      });
      window.location.assign(url);
    } catch (e) {
      setError(checkoutError(e));
      setPending(false);
    }
  };
  return (
    <div className="mt-auto space-y-2">
      <Button
        type="button"
        size="lg"
        variant={featured ? "default" : "outline"}
        className={cn(PLAN_BUTTON_CLASS, "w-full")}
        disabled={pending}
        aria-busy={pending}
        onClick={start}
      >
        <Sparkles aria-hidden className="size-4" />
        {plan === "monthly" ? t("plus.page.subscribeMonthly") : t("plus.page.subscribeYearly")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {t(`plus.page.checkoutError.${error}`)}
        </p>
      )}
    </div>
  );
}

type TrialErrorKey = "used" | "unavailable" | "tooMany" | "signIn" | "network" | "down";

function trialError(e: unknown): TrialErrorKey {
  if (!(e instanceof ApiClientError)) return "network";
  if (e.status === 409) return "used";
  if (e.status === 404) return "unavailable";
  if (e.status === 429) return "tooMany";
  if (e.status === 401) return "signIn";
  return "down";
}

/**
 * The free 7-day trial: no card, nothing charged, ends by itself. Signed out, it asks to sign
 * in; signed in, it starts the trial on our server and reloads with Plus on.
 */
function TrialOffer({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TrialErrorKey | null>(null);
  const start = async () => {
    setPending(true);
    setError(null);
    try {
      await apiRequest<{ endsAt: string }>("/api/v1/plus/trial", { method: "POST" });
      window.location.reload();
    } catch (e) {
      setError(trialError(e));
      setPending(false);
    }
  };
  return (
    <section
      aria-labelledby="plus-trial"
      className="panel flex flex-wrap items-center justify-between gap-4 border-gold/30 p-5"
    >
      <div className="flex max-w-2xl items-start gap-3">
        <Gift aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="space-y-1">
          <h2 id="plus-trial" className="font-semibold">
            {t("plus.page.trial.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("plus.page.trial.body")}</p>
          {error && (
            <p role="alert" className="text-sm text-loss">
              {t(`plus.page.trial.error.${error}`)}
            </p>
          )}
        </div>
      </div>
      {signedIn ? (
        <Button
          type="button"
          className="gap-2"
          disabled={pending}
          aria-busy={pending}
          onClick={start}
        >
          <Gift aria-hidden className="size-4" /> {t("plus.page.trial.start")}
        </Button>
      ) : (
        <Button asChild variant="outline" className="gap-2">
          <a href={signInHref("/plus")}>
            <SteamIcon className="size-4" /> {t("plus.page.trial.signIn")}
          </a>
        </Button>
      )}
    </section>
  );
}

function TrialRunning({ endsAt }: { endsAt: string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <Banner icon={Gift} title={t("plus.page.trial.activeTitle")}>
      {t("plus.page.trial.activeBody", { date: formatBillingDate(endsAt, locale) })}
    </Banner>
  );
}

/** Invite a friend: a week of Plus each, granted in the app (nothing charged). */
function InviteOffer({ signedIn }: { signedIn: boolean }) {
  const t = useT();
  return (
    <section
      aria-labelledby="plus-invite"
      className="panel flex flex-wrap items-center justify-between gap-4 p-5"
    >
      <div className="flex max-w-2xl items-start gap-3">
        <HeartHandshake aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="space-y-1">
          <h2 id="plus-invite" className="font-semibold">
            {t("plus.page.invite.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("plus.page.invite.body")}</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        {signedIn ? (
          <Link href="/invite">{t("plus.page.invite.cta")}</Link>
        ) : (
          <a href={signInHref("/invite")}>{t("plus.page.invite.signIn")}</a>
        )}
      </Button>
    </section>
  );
}

/** "Read the terms, the refund policy and the privacy policy." with each linked. */
export function LegalLinks() {
  const t = useT();
  const [before, first, second, after] = t("plus.page.legal").split(
    /\{terms\}|\{refunds\}|\{privacy\}/,
  );
  return (
    <span>
      {before}
      <Link href="/terms" className="text-gold hover:underline">
        {t("plus.page.termsLink")}
      </Link>
      {first}
      <Link href="/refunds" className="text-gold hover:underline">
        {t("plus.page.refundsLink")}
      </Link>
      {second}
      <Link href="/privacy" className="text-gold hover:underline">
        {t("plus.page.privacyLink")}
      </Link>
      {after}
    </span>
  );
}
