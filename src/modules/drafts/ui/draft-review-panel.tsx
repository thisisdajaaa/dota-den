"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { ReviewResult } from "../application/ai-opponent-service";
import { encodeSnapshot, snapshotOf } from "../application/snapshot";
import type { DraftState, Side } from "../domain/draft-state";
import type { RoleChoices } from "./draft-outlook-panel";

const sideName = (s: Side) => (s === "radiant" ? "Radiant" : "Dire");

/**
 * The AI review of a finished draft. On request (it costs a model call), and clearly
 * labelled: the data report card stays the source of truth.
 */
export function DraftReviewPanel({ state, roles }: { state: DraftState; roles: RoleChoices }) {
  const key = `${encodeSnapshot(snapshotOf(state))}|${JSON.stringify(roles)}`;
  const [result, setResult] = useState<{ key: string; data: ReviewResult } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = result?.key === key ? result.data : null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/drafts/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot: encodeSnapshot(snapshotOf(state)), roles }),
      });
      const body = (await res.json().catch(() => null)) as
        (ReviewResult & { error?: undefined }) | { error?: { message?: string } } | null;
      if (!res.ok || !body || ("error" in body && body.error)) {
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            "The AI review is unavailable right now.",
        );
      }
      setResult({ key, data: body as ReviewResult });
    } catch (e) {
      setError({
        key,
        message: e instanceof Error ? e.message : "The AI review is unavailable right now.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="AI review" className="rounded-xl border border-gold/20 bg-gold/[0.03] p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4 text-gold" /> AI review
          {current && (
            <span className="text-xs font-normal text-muted-foreground">{current.model}</span>
          )}
        </h3>
        {!current && (
          <Button size="sm" variant="outline" onClick={run} disabled={busy}>
            {busy ? "Reviewing…" : "Get the AI review"}
          </Button>
        )}
      </header>
      {!current && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          A language model reads both lineups with this patch&apos;s abilities and the numbers
          above, then explains combos, win conditions and key matchups.
        </p>
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
  const { review, report, adjusted } = data;
  return (
    <div className="mt-2 space-y-3 text-sm">
      <p>{review.summary}</p>
      <div className="grid gap-3 md:grid-cols-2">
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
                {sideName(side)}
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">Win condition: </span>
                {plan.winCondition}
              </p>
              {plan.timing && (
                <p className="mt-1">
                  <span className="text-muted-foreground">Timing: </span>
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
            Combos
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
            Key matchups
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
            Grade nudges
          </h4>
          <ul className="mt-1 space-y-1">
            {review.adjustments.map((a) => (
              <li key={`${a.side}-${a.criterion}`}>
                <span className={a.side === "radiant" ? "text-win" : "text-loss"}>
                  {sideName(a.side)}
                </span>{" "}
                {a.criterion === "combos" ? "Combos" : "Composition"}{" "}
                {a.delta > 0 ? `+${a.delta}` : a.delta}: {a.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            With these nudges: Radiant {adjusted.radiant.grade} ({adjusted.radiant.overall}) · Dire{" "}
            {adjusted.dire.grade} ({adjusted.dire.overall}). The report card above keeps the data
            grades (Radiant {report.radiant.grade}, Dire {report.dire.grade}).
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Written by a language model from the heroes&apos; current abilities and our numbers. It can
        be wrong; it can only nudge Combos and Composition, by up to 8 points, with a reason.
      </p>
    </div>
  );
}
