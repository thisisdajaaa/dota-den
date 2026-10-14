"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Circle, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { ApiClientError, apiRequest } from "@/common/http/api-client";
import { useT } from "@/common/i18n/client";

export interface PlanRow {
  id: string;
  label: string;
  why: string;
  current: string;
  done: boolean | null;
  fraction: number | null;
  /** The match to open, for a review step. */
  href: string | null;
  canSwap: boolean;
}

function Status({ done }: { done: boolean | null }) {
  const t = useT();
  if (done === true)
    return <Check aria-label={t("practice.status.done")} className="size-4 text-emerald-400" />;
  if (done === false)
    return <X aria-label={t("practice.status.broken")} className="size-4 text-rose-400" />;
  return <Circle aria-label={t("practice.status.open")} className="size-4 text-muted-foreground" />;
}

const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50";

/** This week's practice steps, each with the numbers behind it and its progress. */
export function PracticePlanCard({
  rows,
  basic,
  gaps,
}: {
  rows: PlanRow[];
  /** No personal step yet: the plan is the basics. */
  basic: boolean;
  gaps: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(action: "swap" | "dismiss", stepId: string) {
    setBusy(true);
    try {
      await apiRequest("/api/v1/me/practice-plan", { method: "PATCH", body: { action, stepId } });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : t("practice.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="practice-title">
      <div>
        <p className="kicker">{t("practice.kicker")}</p>
        <h2 id="practice-title" className="text-lg font-semibold">
          {t("practice.title")}
        </h2>
      </div>

      {basic && <p className="text-sm text-muted-foreground">{t("practice.basic")}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("practice.empty")}</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="mt-0.5">
                  <Status done={r.done} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {r.href ? (
                      <Link href={r.href} className="underline-offset-2 hover:underline">
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.why}</p>
                  <p className="mt-0.5 text-xs">{r.current}</p>
                </div>
                {r.canSwap && (
                  <button
                    type="button"
                    className={iconButton}
                    disabled={busy}
                    onClick={() => void change("swap", r.id)}
                    aria-label={t("practice.swap", { n: i + 1 })}
                    title={t("practice.swap", { n: i + 1 })}
                  >
                    <Shuffle aria-hidden className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  className={iconButton}
                  disabled={busy}
                  onClick={() => void change("dismiss", r.id)}
                  aria-label={t("practice.dismiss", { n: i + 1 })}
                  title={t("practice.dismiss", { n: i + 1 })}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
              {r.fraction !== null && (
                <div
                  className="ml-6 h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label={r.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(r.fraction * 100)}
                >
                  <div
                    className={cn("h-full", r.done ? "bg-emerald-400" : "bg-gold")}
                    style={{ width: `${Math.round(r.fraction * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {gaps.length > 0 && (
        <ul className="space-y-1 border-t border-white/10 pt-3 text-xs text-muted-foreground">
          {gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
