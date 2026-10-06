"use client";

import { apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { ReviewResult } from "../dtos/responses/drafts.dto";
import { encodeSnapshot, snapshotOf } from "../domain/snapshot";
import type { DraftState } from "../domain/draft-state";
import type { RoleChoices } from "./draft-outlook-panel";
import { sideName } from "./i18n";

/**
 * The AI review of a finished draft. On request (it costs a model call), and clearly
 * labelled: the data report card stays the source of truth.
 */
export function DraftReviewPanel({ state, roles }: { state: DraftState; roles: RoleChoices }) {
  const t = useT();
  const key = `${encodeSnapshot(snapshotOf(state))}|${JSON.stringify(roles)}`;
  const [result, setResult] = useState<{ key: string; data: ReviewResult } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = result?.key === key ? result.data : null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiRequest<ReviewResult>("/api/v1/drafts/review", {
        method: "POST",
        body: { snapshot: encodeSnapshot(snapshotOf(state)), roles },
      });
      setResult({ key, data });
    } catch (e) {
      setError({
        key,
        message: e instanceof Error ? e.message : t("drafts.review.unavailable"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={t("drafts.review.label")}
      className="rounded-xl border border-gold/20 bg-gold/[0.03] p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4 text-gold" /> {t("drafts.review.title")}
          {current && (
            <span className="text-xs font-normal text-muted-foreground">{current.model}</span>
          )}
        </h3>
        {!current && (
          <Button size="sm" variant="outline" onClick={run} disabled={busy}>
            {busy ? t("drafts.review.reviewing") : t("drafts.review.get")}
          </Button>
        )}
      </header>
      {!current && (
        <p className="mt-1.5 text-xs text-muted-foreground">{t("drafts.review.intro")}</p>
      )}
      {error?.key === key && (
        <p role="alert" className="mt-2 text-sm text-loss">
          {error.message}
        </p>
      )}
      {current && <ReviewBody data={current} />}
    </section>
  );
}

function ReviewBody({ data }: { data: ReviewResult }) {
  const t = useT();
  const { review, report, adjusted } = data;
  return (
    <div className="mt-2 space-y-3 text-sm">
      <p>{review.summary}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(["radiant", "dire"] as const).map((side) => {
          const plan = review.sides[side];
          return (
            <div key={side} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <p
                className={cn(
                  "text-[0.65rem] font-semibold tracking-wider uppercase",
                  side === "radiant" ? "text-win" : "text-loss",
                )}
              >
                {sideName(t, side)}
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">{t("drafts.review.winCondition")}</span>
                {plan.winCondition}
              </p>
              {plan.timing && (
                <p className="mt-1">
                  <span className="text-muted-foreground">{t("drafts.review.timing")}</span>
                  {plan.timing}
                </p>
              )}
              {plan.strengths.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {plan.strengths.map((s) => (
                    <li key={s} className="flex gap-1.5">
                      <span aria-hidden className="text-win">
                        +
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {plan.risks.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {plan.risks.map((s) => (
                    <li key={s} className="flex gap-1.5">
                      <span aria-hidden className="text-loss">
                        −
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {review.combos.length > 0 && (
        <div>
          <h4 className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("drafts.review.combos")}
          </h4>
          <ul className="mt-1 space-y-1">
            {review.combos.map((c) => (
              <li key={`${c.side}-${c.heroes.join("+")}`}>
                <span
                  className={cn("font-medium", c.side === "radiant" ? "text-win" : "text-loss")}
                >
                  {c.heroes.join(" + ")}
                </span>
                : {c.why}
              </li>
            ))}
          </ul>
        </div>
      )}
      {review.keyMatchups.length > 0 && (
        <div>
          <h4 className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("drafts.review.keyMatchups")}
          </h4>
          <ul className="mt-1 space-y-1">
            {review.keyMatchups.map((m) => (
              <li key={m.heroes.join("-")}>
                <span className="font-medium">{m.heroes.join(" vs ")}</span>: {m.note}
              </li>
            ))}
          </ul>
        </div>
      )}
      {review.adjustments.length > 0 && (
        <div>
          <h4 className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("drafts.review.nudges")}
          </h4>
          <ul className="mt-1 space-y-1">
            {review.adjustments.map((a) => (
              <li key={`${a.side}-${a.criterion}`}>
                <span className={a.side === "radiant" ? "text-win" : "text-loss"}>
                  {sideName(t, a.side)}
                </span>{" "}
                {a.criterion === "combos"
                  ? t("drafts.review.combos")
                  : t("drafts.review.composition")}{" "}
                {a.delta > 0 ? `+${a.delta}` : a.delta}: {a.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("drafts.review.withNudges", {
              rg: adjusted.radiant.grade ?? "",
              ro: adjusted.radiant.overall ?? "",
              dg: adjusted.dire.grade ?? "",
              do: adjusted.dire.overall ?? "",
              rd: report.radiant.grade ?? "",
              dd: report.dire.grade ?? "",
            })}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("drafts.review.footnote")}</p>
    </div>
  );
}
