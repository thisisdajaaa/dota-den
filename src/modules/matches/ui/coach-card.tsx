"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Bot, CircleAlert, Sparkles, ThumbsUp, Wrench } from "lucide-react";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { plural, type Translator } from "@/common/i18n/translate";
import type { Messages } from "@/common/i18n/messages";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clock, type CoachFact } from "../domain/coach-facts";
import type { PerfStat } from "../domain/match-performance";
import type {
  CoachQuotaDto,
  CoachResultDto,
  CoachReviewDto,
  CoachViewDto,
} from "../dtos/responses/coach.dto";
import { ParseRequest } from "./parse-request";

type Problem = "resting" | "failed" | "unavailable" | "offline" | { message: string };

/** A fact's value from our data, formatted for the viewer (never the model's text). */
export function formatFactValue(t: Translator<Messages>, f: CoachFact): string {
  if (typeof f.value === "string") {
    const known = [
      "win",
      "loss",
      "solo",
      "party",
      "unknown",
      "safe",
      "mid",
      "off",
      "jungle",
      "roaming",
      "won",
      "even",
      "lost",
    ] as const;
    const code = known.find((k) => k === f.value);
    return code ? t(`matches.coach.values.${code}`) : f.value;
  }
  switch (f.unit) {
    case "clock":
      return clock(f.value);
    case "percent":
      return `${f.value}%`;
    case "seconds":
      return `${f.value}s`;
    case "ratio":
      return f.value.toFixed(1);
    default:
      return f.value.toLocaleString("en-US");
  }
}

export function factName(t: Translator<Messages>, f: CoachFact): string {
  const subject =
    f.base === "benchmark" && f.subject
      ? t(`matches.performance.stats.${f.subject as PerfStat}`)
      : (f.subject ?? "");
  return t(`matches.coach.facts.${f.base}`, { subject });
}

/**
 * The AI coach on the owner's own match page (ADR 0014): their review if one was written,
 * else the button (Plus: unlimited; free: one a week) or the parse request it needs first.
 */
export function CoachCard({ matchId, initial }: { matchId: string; initial: CoachViewDto }) {
  const t = useT();
  const [view, setView] = useState(initial);
  // The page refreshes while a parse request waits: take the server's newer state (e.g.
  // unparsed → available) instead of keeping the first one.
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    if (initial.status !== shown.status) setView(initial);
  }
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  if (view.status === "off") return null;

  async function write() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await apiRequest<CoachResultDto>(`/api/v1/matches/${matchId}/coach`, {
        method: "POST",
      });
      setView({ status: "ready", review: res.review, quota: res.quota });
    } catch (e) {
      if (!(e instanceof ApiClientError)) {
        setProblem("offline");
        return;
      }
      const details = e.details as { reason?: string; quota?: CoachQuotaDto } | undefined;
      if (details?.reason === "quota" && details.quota) {
        setView({ status: "locked", quota: details.quota });
      } else if (details?.reason === "resting" || details?.reason === "failed") {
        setProblem(details.reason);
      } else if (details?.reason === "unparsed") {
        setView({ status: "unparsed" });
      } else if (e.status >= 500 || details?.reason === "not_configured") {
        setProblem("unavailable");
      } else {
        setProblem({ message: e.message || t("matches.coach.unavailable") });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="coach-title" className="panel relative space-y-4 overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-gold/10 blur-3xl"
      />
      <header className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker flex items-center gap-1.5">
            <Bot aria-hidden className="size-3.5" /> {t("matches.coach.kicker")}
          </p>
          <h2 id="coach-title" className="text-lg font-semibold">
            {t("matches.coach.title")}
          </h2>
        </div>
        {"quota" in view && <QuotaChip quota={view.quota} />}
      </header>

      {view.status === "unparsed" && (
        <div className="relative space-y-3">
          <p className="text-sm text-muted-foreground">{t("matches.coach.unparsed")}</p>
          <ParseRequest matchId={matchId} />
        </div>
      )}

      {view.status === "available" && (
        <div className="relative space-y-3">
          <p className="max-w-2xl text-sm text-muted-foreground">{t("matches.coach.intro")}</p>
          {busy ? (
            <Writing />
          ) : (
            <Button type="button" className="gap-2" onClick={() => void write()}>
              <Sparkles aria-hidden className="size-4" />
              {t("matches.coach.write")}
            </Button>
          )}
        </div>
      )}

      {view.status === "locked" && <Upsell quota={view.quota} />}

      {problem && (
        <p role="alert" className="relative flex items-start gap-2 text-sm text-loss">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {typeof problem === "string" ? t(`matches.coach.${problem}`) : problem.message}
        </p>
      )}

      {view.status === "ready" && <Review review={view.review} />}

      <p className="relative text-xs text-muted-foreground">{t("matches.coach.disclaimer")}</p>
    </section>
  );
}

function QuotaChip({ quota }: { quota: CoachQuotaDto }) {
  const t = useT();
  const text =
    quota.plan === "plus"
      ? t("matches.coach.plusUnlimited")
      : quota.remaining === 0
        ? t("matches.coach.freeUsed")
        : plural(t, "matches.coach.freeLeft", quota.remaining ?? 0);
  return (
    <p
      data-testid="coach-quota"
      className={cn(
        "rounded-full px-3 py-1 text-xs ring-1",
        quota.plan === "plus"
          ? "bg-gold/10 text-gold ring-gold/30"
          : "bg-white/[0.04] text-muted-foreground ring-white/[0.08]",
      )}
    >
      {text}
    </p>
  );
}

function Writing() {
  const t = useT();
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-gold" />
        {t("matches.coach.writing")}
        <span className="text-muted-foreground">{t("matches.coach.writingHint")}</span>
      </p>
      <div aria-hidden className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}

function Upsell({ quota }: { quota: CoachQuotaDto }) {
  const t = useT();
  return (
    <div className="relative space-y-3">
      <p className="text-sm">
        {t("matches.coach.freeUsed")}
        {quota.resetsAt && (
          <>
            {" "}
            <span className="text-muted-foreground">
              {t("matches.coach.nextFree")} <LocalTime iso={quota.resetsAt} />
            </span>
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/25 bg-gold/[0.04] p-4">
        <div className="max-w-xl space-y-1">
          <p className="font-medium">{t("matches.coach.upsellTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("matches.coach.upsellBody")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/plus">
            {t("matches.coach.upsellLink")} <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Review({ review }: { review: CoachReviewDto }) {
  const t = useT();
  return (
    <div className="relative space-y-3">
      <ol className="space-y-3">
        {review.points.map((p, i) => {
          const Icon = p.kind === "strength" ? ThumbsUp : Wrench;
          return (
            <li
              key={i}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
              aria-label={p.title}
            >
              <p
                className={cn(
                  "mb-1 flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wider uppercase",
                  p.kind === "strength" ? "text-win" : "text-gold",
                )}
              >
                <Icon aria-hidden className="size-3.5" /> {t(`matches.coach.kinds.${p.kind}`)}
              </p>
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.detail}</p>
              {p.facts.length > 0 && (
                <dl
                  aria-label={t("matches.coach.factsLabel")}
                  className="mt-3 flex flex-wrap gap-2"
                >
                  {p.facts.map((f) => (
                    <div
                      key={f.key}
                      className="flex items-baseline gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs ring-1 ring-white/[0.06]"
                    >
                      <dt className="text-muted-foreground">{factName(t, f)}</dt>
                      <dd className="font-medium text-foreground tabular-nums">
                        {formatFactValue(t, f)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
      {review.missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("matches.coach.missing", {
            list: review.missing.map((m) => t(`matches.coach.missingItems.${m}`)).join(", "),
          })}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("matches.coach.model", { model: review.model })} · <LocalTime iso={review.createdAt} />
      </p>
    </div>
  );
}
