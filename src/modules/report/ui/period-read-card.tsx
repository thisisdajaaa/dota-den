"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { cn } from "cn";
import { useT } from "@/common/i18n/client";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { Button } from "@/components/ui/button";
import { clock, type GroundFact } from "@/common/utils/grounding";
import type { ReadKind, ReadPoint } from "../domain/period-read";
import type { PeriodReadDto } from "../dtos/responses/period-read.dto";

export type PeriodReadInitial =
  | { status: "off" | "too_few" | "not_plus" | "available" }
  | { status: "ready"; read: PeriodReadDto };

const KIND_STYLE: Record<ReadKind, string> = {
  strength: "bg-win/10 text-win",
  improve: "bg-loss/10 text-loss",
  focus: "bg-gold/15 text-gold",
};

const factValue = (f: GroundFact) =>
  typeof f.value === "string"
    ? f.value
    : f.unit === "clock"
      ? clock(f.value)
      : f.unit === "percent"
        ? `${f.value}%`
        : f.value.toLocaleString("en-US");

/**
 * The battle report's AI read (Plus): a few observations about the period and one focus,
 * written from the report's own numbers when the player asks, with the facts each one uses.
 */
export function PeriodReadCard({
  from,
  to,
  initial,
}: {
  from: string;
  to: string;
  initial: PeriodReadInitial;
}) {
  const t = useT();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (state.status === "off" || state.status === "too_few") return null;

  async function write() {
    setBusy(true);
    setProblem(null);
    try {
      const read = await apiRequest<PeriodReadDto>("/api/v1/report/read", {
        method: "POST",
        body: { from, to },
      });
      setState({ status: "ready", read });
    } catch (e) {
      const reason =
        e instanceof ApiClientError ? (e.details as { reason?: string } | undefined)?.reason : null;
      setProblem(
        reason === "resting"
          ? t("report.read.resting")
          : reason === "failed"
            ? t("report.read.failed")
            : e instanceof ApiClientError
              ? e.message
              : t("report.read.offline"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="period-read" className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker flex items-center gap-1.5">
            <Bot aria-hidden className="size-3.5" /> {t("report.read.kicker")}
          </p>
          <h2 id="period-read" className="text-lg font-semibold">
            {t("report.read.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("report.read.about")}</p>
        </div>
      </div>

      {state.status === "not_plus" && (
        <p className="text-sm">
          {t("report.read.plusOnly")}{" "}
          <Link href="/plus" className="font-medium text-gold hover:underline">
            {t("report.read.seePlus")}
          </Link>
        </p>
      )}

      {state.status === "available" && (
        <div className="space-y-2">
          <Button onClick={write} disabled={busy}>
            {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {busy ? t("report.read.writing") : t("report.read.write")}
          </Button>
          {problem && (
            <p role="alert" className="text-sm text-loss">
              {problem}
            </p>
          )}
        </div>
      )}

      {state.status === "ready" && (
        <ol className="space-y-3">
          {state.read.points.map((p, i) => (
            <Point key={i} point={p} facts={state.read.facts} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Point({ point, facts }: { point: ReadPoint; facts: readonly GroundFact[] }) {
  const t = useT();
  const used = point.factKeys
    .map((k) => facts.find((f) => f.key === k))
    .filter((f): f is GroundFact => f !== undefined);
  return (
    <li className="space-y-1.5 rounded-lg border border-white/[0.06] p-3">
      <p className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase",
            KIND_STYLE[point.kind],
          )}
        >
          {t(`report.read.kinds.${point.kind}`)}
        </span>
        <span className="font-medium">{point.title}</span>
      </p>
      <p className="text-sm text-muted-foreground">{point.detail}</p>
      {used.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("report.read.basedOn")}>
          {used.map((f) => (
            <li key={f.key} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-xs tabular-nums">
              {f.label}: {factValue(f)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
